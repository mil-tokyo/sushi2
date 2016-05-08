import Colon = require('./colon');
import typedef = require('./typedef');

type AllowedTypedArray = typedef.AllowedTypedArray;//TODO: find way to use AllowedTypedArray in public methods

class Matrix {
  _size: number[];
  _ndims: number;
  _numel: number;
  _klass: string;
  _data_ctor: any;
  _data: typedef.AllowedTypedArray;//allocated in constructor
  _strides: number[];// in typedarray index (not byte)
  static _autodestruct_stack: Matrix[][] = [];
  static _autodestruct_stack_top: Matrix[] = null;

  constructor(size: number[], klass: string = 'single', noalloc: boolean = false) {
    var _size: number[] = Array.prototype.slice.call(size);//copy
    //verify size
    var tmpnumel: number = 1;
    var strides: number[] = [];
    var last_none_one_dim = 0;
    if (_size.length < 2) {
      throw new Error('matrix must have at least 2 dimensions');
    }
    for (var i = 0; i < _size.length; i++) {
      var dimsize = _size[i];
      if (typeof (dimsize) !== 'number' || dimsize < 0 || !Matrix._isinteger(dimsize)) {
        throw new Error('size is invalid');
      }
      if (dimsize != 1) {
        last_none_one_dim = i;
      }
      strides.push(tmpnumel);
      tmpnumel *= dimsize;
    }
    if (tmpnumel >= 2147483648) {
      // indexing with int32 value is impossible
      throw new Error('Matrix of equal to or more than 2G elements is not supported');
    }
    this._numel = tmpnumel;
    //remove tail dimensions with size 1 (retain minimum 2 dimensions)
    last_none_one_dim = Math.max(last_none_one_dim, 1) + 1;
    _size.splice(last_none_one_dim);
    strides.splice(last_none_one_dim);
    this._size = _size;
    this._ndims = _size.length;
    this._strides = strides;

    if (!Matrix._isvalidklass(klass)) {
      throw new Error('unknown klass');
    }
    this._klass = klass;
    this._data_ctor = Matrix.data_ctors[klass];
    if (!noalloc) {
      this._alloccpu();
    }

    if (Matrix._autodestruct_stack_top) {
      Matrix._autodestruct_stack_top.push(this);
    }
  }

  static data_ctors = { 'single': Float32Array, 'int32': Int32Array, 'uint8': Uint8Array, 'logical': Uint8Array };

  static autodestruct_push(): void {
    var array = [];
    Matrix._autodestruct_stack_top = array;
    Matrix._autodestruct_stack.push(array);
  }

  static autodestruct_pop(): void {
    if (Matrix._autodestruct_stack_top) {
      //destruct all in current list
      //console.log('Autodestruct: ' + Matrix._autodestruct_stack_top.length + ' mats');
      for (var i = 0; i < Matrix._autodestruct_stack_top.length; i++) {
        Matrix._autodestruct_stack_top[i].destruct();
      }

      Matrix._autodestruct_stack.pop();
      Matrix._autodestruct_stack_top = Matrix._autodestruct_stack[Matrix._autodestruct_stack.length - 1];
    }
  }

  destruct() {
    //release memory
    this._data = null;
  }
  
  inspect(depth: number): string {
    var shape_str = this._size.join('x');
    if (this._numel <= 100) {
      return 'Matrix ' + shape_str + ' ' + this._klass + '\n' + this.toString();
    } else {
      return 'Matrix ' + shape_str + ' ' + this._klass;
    }
  }
  
  static typedarray2mat(size: number[], klass: string = 'single', data: typedef.AllowedTypedArray): Matrix {
    //type check
    if (!(data instanceof Matrix.data_ctors[klass])) {
      throw Error('klass and data type mismatch');
    }
    
    var m = new Matrix(size, klass, true);
    if (data.length < m._numel) {
      throw Error('The length of data is smaller than matrix size');
    }
    
    m._data = data;
    if (klass === 'logical') {
      //force values to 0/1
      for (var i = 0; i < m._numel; i++) {
        data[i] = Number(data[i] != 0);
      }
    }
    return m;
  }

  static _isinteger(x) {
    return Math.round(x) == x;
  }

  static _isvalidklass(klass) {
    return klass == 'single' || klass == 'int32' || klass == 'uint8' || klass == 'logical';
  }

  static _logical_cast_required(klass_dst: string, klass_src?: string): boolean {
    return (klass_dst == 'logical' && klass_src != 'logical');
  }

  static _logical_cast(val: any): number {
    return Number(Boolean(val));
  }

  private _alloccpu(): typedef.AllowedTypedArray {
    // allocate cpu buffer if not exist
    if (!this._data) {
      this._data = new this._data_ctor(this._numel);
    }

    return this._data;
  }

  to_cpu(): Matrix {
    return this;
  }

  _getdata(): typedef.AllowedTypedArray {
    //override in gpu
    //get copy of data in TypedArray
    return this._data;
  }

  _isvalidindex(inds: number[]): boolean {
    if (this._numel == 0) {
      // if matrix have zero dimension, all index is invalid
      return false;
    }
    if (inds.length == 0) {
      return false;
    } else if (inds.length == 1) {
      return Matrix._isinteger(inds[0]) && ((inds[0] > 0 && inds[0] <= this._numel) || (inds[0] < 0 && (-inds[0]) <= this._numel));
    } else {
      for (var dim = 0; dim < inds.length; dim++) {
        var ind = inds[dim];
        var dimsize = this._size[dim] || 1;
        // if dimensions of inds is more than matrix dimensions, only 1 is ok for the extra dimension
        if (Matrix._isinteger(ind) && ((ind > 0 && (ind <= dimsize) || (ind < 0 && -ind <= dimsize)))) {
          //ok
        } else {
          return false;
        }
      }
    }

    return true;
  }

  _isvalidindexerr(inds: number[]): void {
    if (!this._isvalidindex(inds)) {
      throw new Error('Invalid index');
    }
  }

  _getarrayindex(inds: number[]): number {
    // assume inds is valid
    var idx = 0;
    if (inds.length == 1) {
      var ind = inds[0];
      if (ind < 0) {
        ind += this._numel + 1;
      }
      idx = ind - 1;
    } else {
      for (var dim = 0; dim < inds.length; dim++) {
        var ind = inds[dim];
        if (ind < 0) {
          ind += (this._size[dim] || 1) + 1;
        }
        idx += (ind - 1) * (this._strides[dim] || 0);//trailing 1 does not affect
      }
    }

    return idx;
  }

  static numel(A: Matrix): number {
    return A._numel;
  }

  static size(X: Matrix): Matrix;
  static size(X: Matrix, dim: number): number;
  static size(X: Matrix, dim?: number): any {
    if (dim == undefined) {
      return Matrix.jsa2mat([X._size]);
    } else {
      return X._size[dim - 1];
    }
  }

  static sizejsa(X: Matrix): number[] {
    return X._size;
  }

  static jsa2mat(ary: any, one_d_column?: boolean, klass?: string): Matrix {
    // TODO: type inference (contains non-integer => single, contains boolean => logical)
    // get dimension
    var mat: Matrix;
    if (typeof (ary) === 'number') {
      //1x1 matrix
      mat = new Matrix([1, 1], klass);
      mat.set_scalar(<number>ary, [1]);
    } else {
      if (ary.length == 0) {
        //0x0 matrix
        mat = new Matrix([0, 0], klass);
      } else if (ary[0].length === void 0) {
        //1-d array
        var vecshape = one_d_column ? [ary.length, 1] : [1, ary.length];
        mat = new Matrix(vecshape, klass);
        for (var i = 0; i < ary.length; i++) {
          mat.set_scalar(ary[i], [i + 1]);
        }
      } else {
        var dim_size: number[] = [];
        //treat as row-major memory order; ary[row][col][dim3][dim4]
        var inner = ary;
        while (!!inner.length) {
          dim_size.push(inner.length);
          inner = inner[0];
        }
        if (dim_size.length != 2) {
          throw new Error('Currently array must be 2-D');
        }
        mat = new Matrix(dim_size, klass);
        var rawdata = mat._alloccpu();
      
        //TODO: support n-d array
        for (var row = 0; row < dim_size[0]; row++) {
          var rowdata = ary[row];
          for (var col = 0; col < dim_size[1]; col++) {
            var val = rowdata[col];
            mat.set_scalar(val, [row + 1, col + 1]);
          }
        }
      }
    }

    return mat;
  }

  mat2jsa(one_d_flatten: boolean = false): any[] {
    //TODO: support n-d array
    //empty matrix will be [] not [[]]
    if (this._ndims > 2) {
      throw new Error('Currently matrix must be 2-D');
    }
    var ary = [];
    var flattened = false;
    if (one_d_flatten) {
      if (this._numel == this._size[0]) {
        //column vector
        for (var row = 0; row < this._size[0]; row++) {
          ary.push(this.get_scalar([row + 1, 1]));
        }
        flattened = true;
      } else if (this._numel == this._size[1]) {
        //row vector
        for (var col = 0; col < this._size[1]; col++) {
          ary.push(this.get_scalar([1, col + 1]));
        }
        flattened = true;
      }
    }

    if (!flattened) {
      for (var row = 0; row < this._size[0]; row++) {
        var rowary = [];
        for (var col = 0; col < this._size[1]; col++) {
          rowary.push(this.get_scalar([row + 1, col + 1]));
        }
        ary.push(rowary);
      }
    }
    return ary;
  }

  get(): number;
  get(...args: number[]): number;
  get(...args: any[]): Matrix;
  get(...args: any[]): any {
    if (args.length == 0) {
      // get scalar
      return this._alloccpu()[0];
    }
    var all_number = args.every((v) => typeof (v) === 'number');
    if (all_number) {
      return this.get_scalar(args);
    } else {
      if (args.length > 1) {
        return this.get_matrix_nd(args);
      } else {
        if (args[0] instanceof Matrix && (<Matrix>args[0])._klass === 'logical') {
          return this.get_matrix_logical(args[0]);
        } else {
          return this.get_matrix_single(args[0]);
        }
      }
    }
  }
  
  // returns value of (1,1) or 0
  valueOf(): number {
    if (this._numel > 0) {
      return this.get();
    } else {
      return 0;
    }
  }

  copy(klass?: string): Matrix {
    var clone = new Matrix(this._size, klass || this._klass);
    var clone_data = clone._getdata();
    var rawdata = this._alloccpu();
    if (Matrix._logical_cast_required(clone._klass, this._klass)) {
      for (var i = 0, length = clone_data.length; i < length; i++) {
        clone_data[i] = Matrix._logical_cast(rawdata[i]);
      }
    } else {
      clone_data.set(rawdata);
    }

    return clone;
  }

  get_scalar(inds: number[]): number {
    var rawdata = this._alloccpu();
    this._isvalidindexerr(inds);
    var arrayidx = this._getarrayindex(inds);
    return rawdata[arrayidx];
  }

  get_matrix_nd(inds: (number | Colon | Matrix)[]): Matrix {
    //multidim indexing
    //convert index of each dimension into array
    var eachdimidx: (number[] | AllowedTypedArray)[] = [];
    var eachdimstride: number[] = [];
    var output_size: number[] = [];
    var output_length = 1;
    var inputdimctr: number[] = [];
    for (var dim = 0; dim < inds.length; dim++) {
      var dimind = inds[dim];
      var dimidx;
      if (dimind instanceof Colon) {
        dimidx = dimind.tojsa(this._size[dim]);
      } else if (dimind instanceof Matrix) {
        dimidx = dimind._getdata();
      } else {
        //number
        dimidx = [<number>dimind];
      }
        
      //range check
      var dim_size = this._size[dim] || 1;//exceed dimension must be [1,1,...]
      for (var i = 0; i < dimidx.length; i++) {
        if ((dimidx[i] > dim_size) || (dimidx[i] < 1)) {
          throw new Error('Index exceeds matrix dimension');
        }
      }

      eachdimidx.push(dimidx);
      eachdimstride.push(this._strides[dim] || 0);
      output_size.push(dimidx.length);
      output_length *= dimidx.length;
      inputdimctr.push(0);
    }

    var output = new Matrix(output_size, this._klass);
    var output_data = output._data;
    var input_data = this._data;
    for (var i = 0; i < output_length; i++) {
      //calc input index
      var input_raw_idx = 0;
      for (var dim = 0; dim < eachdimidx.length; dim++) {
        input_raw_idx += (eachdimidx[dim][inputdimctr[dim]] - 1) * eachdimstride[dim];
      }

      output_data[i] = input_data[input_raw_idx];
        
      //increment input index
      for (var dim = 0; dim < inputdimctr.length; dim++) {
        var element = ++inputdimctr[dim];
        if (element >= eachdimidx[dim].length) {
          //overflow to next dimension
          inputdimctr[dim] = 0;
        } else {
          break;
        }
      }
    }

    return output;
  }

  get_matrix_single(singleind: Colon | Matrix): Matrix {
    var single_idx_array: number[] | AllowedTypedArray;
    var output_size: number[];
    if (singleind instanceof Colon) {
      single_idx_array = singleind.tojsa(this._numel);
      output_size = [1, single_idx_array.length];//row vector
    } else if (singleind instanceof Matrix) {
      // returns matrix of same shape
      // value in matrix is used as linear index
      single_idx_array = singleind._data;
      output_size = singleind._size;
    }

    var output = new Matrix(output_size, this._klass);
    var output_data = output._data;
    var input_data = this._data;
    for (var i = 0, length = single_idx_array.length; i < length; i++) {
      output_data[i] = input_data[single_idx_array[i] - 1];
    }

    return output;
  }

  get_matrix_logical(map: Matrix): Matrix {
    // equivalent to this.get(find(map))
    var output_length = 0;
    var map_data = map._getdata();
    var max_i = -1;
    for (var i = 0, length = map_data.length; i < length; i++) {
      if (map_data[i]) {
        output_length++;
        max_i = i;
      }
    }

    if (this._numel <= max_i) {
      throw new Error('Index out of bounds');
    }

    var output = new Matrix([output_length, 1], this._klass);
    var output_data = output._data;
    var input_data = this._data;
    var ptr = 0;
    for (var i = 0, length = map_data.length; i < length; i++) {
      if (map_data[i]) {
        output_data[ptr++] = input_data[i];
      }
    }

    return output;
  }

  set(ind: number | Matrix | Colon, val: number | Matrix | any[]): void;
  set(row: number | Matrix | Colon, col: number | Matrix | Colon, val: number | Matrix | any[]): void;
  set(...args: any[]): void;
  set(...args: any[]): void {
    //last argument is value, but subsequent function requires first argument to be value
    var val = args.pop();
    if (!(val instanceof Matrix) && val.length !== void 0) {
      // js array (or array-like)
      val = Matrix.jsa2mat(val, false, this._klass);
    }
    // scalar matrix converted to number
    if (val instanceof Matrix && val._numel == 1) {
      val = (<Matrix>val).get_scalar([1]);
    }

    var all_number = args.every((v) => typeof (v) === 'number');
    if (all_number) {
      this.set_scalar(val, args);
    } else {
      if (args.length > 1) {
        this.set_matrix_nd(val, args);
      } else {
        if (args[0] instanceof Matrix && (<Matrix>args[0])._klass === 'logical') {
          this.set_matrix_logical(val, args[0]);
        } else {
          this.set_matrix_single(val, args[0]);
        }
      }
    }
  }

  set_scalar(val: number | Matrix, inds: number[]): void {
    var rawdata = this._alloccpu();
    this._isvalidindexerr(inds);
    var arrayidx = this._getarrayindex(inds);
    var scalar_val: number;
    if (val instanceof Matrix) {
      if (val._numel != 1) {
        throw new Error('Value is not scalar');
      }
      scalar_val = val._getdata()[0];
    } else {
      scalar_val = <number>val;
    }

    if (Matrix._logical_cast_required(this._klass)) {
      scalar_val = Matrix._logical_cast(scalar_val);
    }
    rawdata[arrayidx] = scalar_val;
  }

  set_matrix_single(val: number | Matrix, singleind: Colon | Matrix): void {
    var single_idx_array: number[] | AllowedTypedArray;
    var output_size: number[];
    if (singleind instanceof Colon) {
      single_idx_array = singleind.tojsa(this._numel);
    } else if (singleind instanceof Matrix) {
      // value in matrix is used as linear index
      // used as flattened value array, regardless of shape
      single_idx_array = singleind._data;
    }

    var rawdata = this._alloccpu();

    if (val instanceof Matrix) {
      if (single_idx_array.length != val._numel) {
        throw new Error('Dimension mismatch');
      }
      var val_data = val._getdata();
      // read over flattened val
      if (Matrix._logical_cast_required(this._klass, val._klass)) {
        rawdata[single_idx_array[i] - 1] = Matrix._logical_cast(val_data[i]);
      } else {
        for (var i = 0, length = single_idx_array.length; i < length; i++) {
          rawdata[single_idx_array[i] - 1] = val_data[i];
        }
      }
    } else {
      var scalar_val;
      if (Matrix._logical_cast_required(this._klass)) {
        scalar_val = Matrix._logical_cast(<number>val);
      } else {
        scalar_val = <number>val;
      }
      for (var i = 0, length = single_idx_array.length; i < length; i++) {
        rawdata[single_idx_array[i] - 1] = scalar_val;
      }
    }
  }

  set_matrix_nd(val: number | Matrix, inds: (number | Colon | Matrix)[]): void {
    //multidim indexing
    //convert index of each dimension into array
    var eachdimidx: (number[] | AllowedTypedArray)[] = [];
    var eachdimstride: number[] = [];
    var output_size: number[] = [];
    var output_length = 1;
    var inputdimctr: number[] = [];
    for (var dim = 0; dim < inds.length; dim++) {
      var dimind = inds[dim];
      var dimidx;
      if (dimind instanceof Colon) {
        dimidx = dimind.tojsa(this._size[dim]);
      } else if (dimind instanceof Matrix) {
        dimidx = dimind._getdata();
      } else {
        //number
        dimidx = [<number>dimind];
      }
        
      //range check
      var dim_size = this._size[dim] || 1;//exceed dimension must be [1,1,...]
      for (var i = 0; i < dimidx.length; i++) {
        if ((dimidx[i] > dim_size) || (dimidx[i] < 1)) {
          throw new Error('Index exceeds matrix dimension');
        }
      }

      eachdimidx.push(dimidx);
      eachdimstride.push(this._strides[dim] || 0);
      output_size.push(dimidx.length);
      output_length *= dimidx.length;
      inputdimctr.push(0);
    }


    var rawdata = this._alloccpu();
    if (val instanceof Matrix) {
      //val shape check
      var is_vector = output_size.filter((v) => v != 1).length <= 1;
      if (is_vector) {
        // if shape is vector, only numel have to match
        if (val._numel != output_length) {
          throw new Error('Dimensions mismatch');
        }
      } else {
        // shape must match (exclude tailing 1)
        for (var dim = 0; dim < Math.max(val._size.length, output_size.length); dim++) {
          if ((val._size[dim] || 1) != (output_size[dim] || 1)) {
            throw new Error('Dimensions mismatch');
          }
        }
      }

      var val_data = val._getdata();
      if (Matrix._logical_cast_required(this._klass, val._klass)) {
        for (var i = 0; i < output_length; i++) {
          //calc input index
          var input_raw_idx = 0;
          for (var dim = 0; dim < eachdimidx.length; dim++) {
            input_raw_idx += (eachdimidx[dim][inputdimctr[dim]] - 1) * eachdimstride[dim];
          }

          rawdata[input_raw_idx] = Matrix._logical_cast(val_data[i]);
        
          //increment input index
          for (var dim = 0; dim < inputdimctr.length; dim++) {
            var element = ++inputdimctr[dim];
            if (element >= eachdimidx[dim].length) {
              //overflow to next dimension
              inputdimctr[dim] = 0;
            } else {
              break;
            }
          }
        }

      } else {
        for (var i = 0; i < output_length; i++) {
          //calc input index
          var input_raw_idx = 0;
          for (var dim = 0; dim < eachdimidx.length; dim++) {
            input_raw_idx += (eachdimidx[dim][inputdimctr[dim]] - 1) * eachdimstride[dim];
          }

          rawdata[input_raw_idx] = val_data[i];
        
          //increment input index
          for (var dim = 0; dim < inputdimctr.length; dim++) {
            var element = ++inputdimctr[dim];
            if (element >= eachdimidx[dim].length) {
              //overflow to next dimension
              inputdimctr[dim] = 0;
            } else {
              break;
            }
          }
        }

      }

    } else {
      //val is scalar
      var scalar_val;
      if (Matrix._logical_cast_required(this._klass)) {
        scalar_val = Matrix._logical_cast(<number>val);
      } else {
        scalar_val = <number>val;
      }

      for (var i = 0; i < output_length; i++) {
        //calc input index
        var input_raw_idx = 0;
        for (var dim = 0; dim < eachdimidx.length; dim++) {
          input_raw_idx += (eachdimidx[dim][inputdimctr[dim]] - 1) * eachdimstride[dim];
        }

        rawdata[input_raw_idx] = scalar_val;
        
        //increment input index
        for (var dim = 0; dim < inputdimctr.length; dim++) {
          var element = ++inputdimctr[dim];
          if (element >= eachdimidx[dim].length) {
            //overflow to next dimension
            inputdimctr[dim] = 0;
          } else {
            break;
          }
        }
      }

    }

  }

  set_matrix_logical(val: number | Matrix, map: Matrix): void {
    // equivalent to this.set(val, find(map))
    var output_length = 0;
    var map_data = map._getdata();
    var max_i = -1;
    for (var i = 0, length = map_data.length; i < length; i++) {
      if (map_data[i]) {
        output_length++;
        max_i = i;
      }
    }

    if (this._numel < max_i) {
      throw new Error('Index out of bounds');
    }

    var rawdata = this._alloccpu();
    if (val instanceof Matrix) {
      var val_data = val._getdata();
      var ptr = 0;
      if (Matrix._logical_cast_required(this._klass, val._klass)) {
        for (var i = 0, length = map_data.length; i < length; i++) {
          if (map_data[i]) {
            rawdata[i] = Matrix._logical_cast(val_data[ptr++]);
          }
        }

      } else {
        for (var i = 0, length = map_data.length; i < length; i++) {
          if (map_data[i]) {
            rawdata[i] = val_data[ptr++];
          }
        }
      }
    } else {
      var ptr = 0;
      var scalar_val;
      if (Matrix._logical_cast_required(this._klass)) {
        scalar_val = Matrix._logical_cast(val);
      } else {
        scalar_val = <number>val;
      }
      for (var i = 0, length = map_data.length; i < length; i++) {
        if (map_data[i]) {
          rawdata[i] = scalar_val;
        }
      }
    }

  }

  toString(): string {
    var s = '';
    var rows = this._size[0], cols = this._size[1];
    var rawdata = this._alloccpu();
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        s += rawdata[col * rows + row] + '\t';
      }
      s += '\n';
    }
    return s;
  }

  disp(X?: any): void {
    var s = '';
    if (this !== void 0) {
      s = this.toString();
    } else {
      s = X.toString();
    }
    console.log(s);
  }

  reshape_inplace(sz: Matrix);
  reshape_inplace(sz: number[]);
  reshape_inplace(...sz: number[]);
  reshape_inplace(...args: any[]): void {
    var _size: number[];
    var first_arg = args[0];
    //convert to Array
    if (first_arg instanceof Matrix) {
      var tarray = first_arg._getdata();
      _size = Array.prototype.slice.call(tarray);
    } else if (first_arg.length !== void 0) {
      _size = Array.prototype.slice.call(first_arg);
    } else {
      _size = Array.prototype.slice.call(args);
    }
    
    //type check
    var tmpnumel: number = 1;
    var strides: number[] = [];
    var last_none_one_dim = 0;
    if (_size.length < 2) {
      throw new Error('matrix must have at least 2 dimensions');
    }
    //substitute -1 to remaining value
    var minus_pos = -1;
    var remaining_prod = 1;
    for (var i = 0; i < _size.length; i++) {
      if (_size[i] < 0) {
        if (minus_pos >= 0) {
          throw new Error('Only one free size is accepted');
        }
        minus_pos = i;
      } else {
        remaining_prod *= _size[i];
      }
    }
    if (minus_pos >= 0) {
      _size[minus_pos] = this._numel / remaining_prod;
    }

    for (var i = 0; i < _size.length; i++) {
      var dimsize = _size[i];
      if (typeof (dimsize) !== 'number' || dimsize < 0 || !Matrix._isinteger(dimsize)) {
        throw new Error('size is invalid');
      }
      if (dimsize != 1) {
        last_none_one_dim = i;
      }
      strides.push(tmpnumel);
      tmpnumel *= dimsize;
    }

    if (tmpnumel !== this._numel) {
      throw new Error('New shape must have same elements');
    }
    
    //remove tail dimensions with size 1 (retain minimum 2 dimensions)
    last_none_one_dim = Math.max(last_none_one_dim, 1) + 1;
    _size.splice(last_none_one_dim);
    strides.splice(last_none_one_dim);

    this._size = _size;
    this._numel = tmpnumel;
    this._ndims = _size.length;
    this._strides = strides;
  }

  squeeze_inplace(): void {
    if (this._ndims == 2) {
      // keep [1,5] remained
      return;
    }
    var new_size = this._size.filter((v) => v !== 1);
    //append 1 to tail
    while (new_size.length < 2) {
      new_size.push(1);
    }
    var tmpnumel = 1;
    var strides: number[] = [];
    for (var dim = 0; dim < new_size.length; dim++) {
      var dimsize = new_size[dim];
      strides.push(tmpnumel);
      tmpnumel *= dimsize;
    }

    this._size = new_size;
    this._ndims = new_size.length;
    this._strides = strides;
  }
}

export = Matrix;
