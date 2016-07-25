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

  getdataref(src_offset: number = 0, length?: number): typedef.AllowedTypedArray {
    //get read-only view of array
    if (!src_offset && length == null) {
      return this._data;
    } else {
      if (length == null) {
        length = this._numel;
      }
      return new this._data_ctor(this._data.buffer, src_offset * this._data.BYTES_PER_ELEMENT, length);
    }
  }

  getdatacopy(src_offset: number = 0, length?: number, dst?: typedef.AllowedTypedArray): typedef.AllowedTypedArray {
    if (length == null) {
      length = this._numel - src_offset;
    }
    if (!dst) {
      dst = new this._data_ctor(length);
    }

    var range_view = new this._data_ctor(this._data.buffer, src_offset * this._data.BYTES_PER_ELEMENT, length);
    dst.set(range_view);
    return dst;
  }

  setdata(src: typedef.AllowedTypedArray, dst_offset: number = 0): void {
    //set raw data into buffer
    this._data.set(src, dst_offset);
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
      if (inds.length < this._ndims) {
        // last index last index is regarded as linear index of remaining dimensions
        for (var dim = 0; dim < inds.length; dim++) {
          var ind = inds[dim];
          var dimsize: number;
          if (dim == inds.length - 1) {
            //last index
            dimsize = 1;
            for (var dimex = dim; dimex < this._ndims; dimex++) {
              dimsize *= this._size[dimex];
            }
          } else {
            dimsize = this._size[dim];
          }
          if (Matrix._isinteger(ind) && ((ind > 0 && (ind <= dimsize) || (ind < 0 && -ind <= dimsize)))) {
            //ok
          } else {
            return false;
          }
        }
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
      if (inds.length < this._ndims) {
        // last index last index is regarded as linear index of remaining dimensions
        for (var dim = 0; dim < inds.length; dim++) {
          var ind = inds[dim];
          if (ind < 0) {
            var dimsize: number;
            if (dim == inds.length - 1) {
              //last index
              dimsize = 1;
              for (var dimex = dim; dimex < this._ndims; dimex++) {
                dimsize *= this._size[dimex];
              }
            } else {
              dimsize = this._size[dim];
            }
            ind += dimsize + 1;
          }
          idx += (ind - 1) * (this._strides[dim] || 0);//trailing 1 does not affect
        }
      } else {
        for (var dim = 0; dim < inds.length; dim++) {
          var ind = inds[dim];
          if (ind < 0) {
            ind += (this._size[dim] || 1) + 1;
          }
          idx += (ind - 1) * (this._strides[dim] || 0);//trailing 1 does not affect
        }
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

  static jsa2mat(ary: any, one_d_column: boolean = false, klass: string = 'single'): Matrix {
    // TODO: type inference (contains non-integer => single, contains boolean => logical)
    // get dimension
    var mat: Matrix;
    if (typeof (ary) === 'number') {
      //1x1 matrix
      mat = new Matrix([1, 1], klass);
      mat.set_scalar(<number>ary, [1]);
    } else if (ary instanceof Matrix) {
      //simply copy
      mat = (<Matrix>ary).copy();
    } else if (!ary.length) {
      //0x0 matrix (length is undefined or 0)
      mat = new Matrix([0, 0], klass);
    } else {
      //n-d matrix
      //get shape
      var size: number[] = [];
      var cur_ary: any[] = ary;
      var numel = 1;
      while (cur_ary.length !== void 0) {
        size.push(cur_ary.length);
        numel *= cur_ary.length;
        cur_ary = cur_ary[0];
      }
      var ndims = size.length;
      var cstride = [];
      var fstride = [];
      var last_cstride = 1;
      var last_fstride = 1;
      for (var dim = 0; dim < size.length; dim++) {
        cstride.unshift(last_cstride);
        fstride.push(last_fstride);
        last_cstride *= size[size.length - 1 - dim];
        last_fstride *= size[dim];
      }

      //flatten data
      var data_ctor = Matrix.data_ctors[klass];
      var data: AllowedTypedArray = new data_ctor(numel);
      var flat_i = 0;

      var n = function (a, dim, fidx_ofs) {
        if (a.length != size[dim]) {
          throw Error('Inconsistent size of n-d array');
        }
        if (dim == ndims - 1) {
          // a contains numbers
          for (var i = 0; i < size[dim]; i++) {
            var val = a[i];
            var fidx = fidx_ofs + Math.floor(flat_i / cstride[dim]) % size[dim] * fstride[dim];
            data[fidx] = val;
            flat_i++;
          }

        } else {
          for (var i = 0; i < size[dim]; i++) {
            n(a[i], dim + 1, fidx_ofs + Math.floor(flat_i / cstride[dim]) % size[dim] * fstride[dim]);
          }
        }
      }

      n(ary, 0, 0);
      if (ndims == 1) {
        if (one_d_column) {
          size = [size[0], 1];
        } else {
          size = [1, size[0]];
        }
      }

      mat = Matrix.typedarray2mat(size, klass, data);
    }

    return mat;
  }

  mat2jsa(one_d_flatten: boolean = false): any[] {
    //empty matrix will be [] not [[]]
    var ary = [];
    if (one_d_flatten && this._ndims == 2 && (this._size[0] == 1 || this._size[1] == 1)) {
      var data = this.getdataref();
      for (var i = 0; i < data.length; i++) {
        ary.push(data[i]);
      }
    } else {
      //n-d jagged array
      var size = this._size;
      var ndims = this._ndims;
      var data = this.getdataref();

      var cstride = [];
      var fstride = [];
      var last_cstride = 1;
      var last_fstride = 1;
      for (var dim = 0; dim < ndims; dim++) {
        cstride.unshift(last_cstride);
        fstride.push(last_fstride);
        last_cstride *= size[ndims - 1 - dim];
        last_fstride *= size[dim];
      }

      var flat_i = 0;//c-order
      var n = function (a, dim, fidx_ofs) {
        if (dim == ndims - 1) {
          for (var i = 0; i < size[dim]; i++) {
            var fidx = fidx_ofs + Math.floor(flat_i / cstride[dim]) % size[dim] * fstride[dim];
            a.push(data[fidx]);
            flat_i++;
          }
        } else {
          for (var i = 0; i < size[dim]; i++) {
            var newa = [];
            a.push(newa);
            n(newa, dim + 1, fidx_ofs + Math.floor(flat_i / cstride[dim]) % size[dim] * fstride[dim]);
          }
        }
      }

      n(ary, 0, 0);
    }
    return ary;
  }

  get(): number;
  get(...args: number[]): number;
  get(...args: any[]): Matrix;
  get(...args: any[]): any {
    if (this._numel == 0) {
      throw Error('Matrix with no element');
    }
    if (args.length == 0) {
      // get scalar
      return this._alloccpu()[0];
    }
    var all_number = args.every((v) => typeof (v) === 'number');
    if (all_number) {
      return this.get_scalar(args);
    } else {
      return this.get_matrix_nd(args);

      // if (args.length > 1) {
      //   return this.get_matrix_nd(args);
      // } else {
      //   if (args[0] instanceof Matrix && (<Matrix>args[0])._klass === 'logical') {
      //     return this.get_matrix_logical(args[0]);
      //   } else {
      //     return this.get_matrix_single(args[0]);
      //   }
      // }
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

  private static _get_ind_iterator(ind: (number | Colon | Matrix), dim_size: number): { iter: (index: number) => number, length: number } {
    // argument index is 0-origin
    // return index within valid range
    if (typeof (ind) === 'number') {
      var ind_positive = <number>ind;
      if (ind_positive < 0) {//end-xxx
        ind_positive += dim_size + 1;
      }
      if (ind_positive <= 0 || ind_positive > dim_size) {
        throw Error('Index exceeds matrix dimension');
      }
      return {
        iter: function (index) {
          return ind_positive;
        }, length: 1
      };
    } else if (ind instanceof Colon) {
      var start = ind.start;
      var stop = ind.stop;
      var step = ind.step;
      if (ind.all) {
        start = 1;
        stop = dim_size;
        step = 1;
      }
      if (start < 0) {
        start += dim_size + 1;
      }
      if (stop < 0) {
        stop += dim_size + 1;
      }
      var length: number = 0;
      if ((step > 0 && stop >= start) || (step < 0 && stop <= start)) {
        length = Math.floor((stop - start) / step) + 1;
        // check if in valid range
        var final_value = start + step * (length - 1);
        if ((start <= 0 || start > dim_size) || (final_value <= 0 || final_value > dim_size)) {
          throw Error('Index exceeds matrix dimension');
        }
      }
      return {
        iter: function (index) {
          return start + step * index;
        },
        length: length
      }
    } else if (ind instanceof Matrix) {
      var dataref = ind.getdataref();
      // check if in valid range
      for (var i = 0; i < dataref.length; i++) {
        var element = dataref[i];
        if (element <= 0 || element > dim_size) {
          throw Error('Index exceeds matrix dimension');
        }
      }

      return {
        iter: function (index) {
          return dataref[index];
        },
        length: dataref.length
      }
    }
  }

  get_matrix_nd(inds: (number | Colon | Matrix)[]): Matrix {
    var inds_ndim = inds.length;
    // replace logical matrix with vector
    for (var i = 0; i < inds_ndim; i++) {
      var ind = inds[i];
      if (ind instanceof Matrix) {
        if (ind._klass == 'logical') {
          inds[i] = ind._find();
        }
      }
    }

    var virtual_input_shape: number[] = [];
    if (this._ndims <= inds_ndim) {
      // pad with 1
      virtual_input_shape = this._size.concat();
      while (virtual_input_shape.length < inds_ndim) {
        virtual_input_shape.push(1);
      }
    } else {
      // last dimension is like linear index
      let cur_prod = 1;
      for (let dim = 0; dim < inds_ndim - 1; dim++) {
        virtual_input_shape.push(this._size[dim]);
        cur_prod *= this._size[dim];
      }
      virtual_input_shape.push(this._numel / cur_prod);
    }
    var virtual_input_stride: number[] = [];
    var stride_tmp = 1;
    for (var dim = 0; dim < inds_ndim; dim++) {
      virtual_input_stride.push(stride_tmp);
      stride_tmp *= virtual_input_shape[dim];
    }

    var ind_iters = [];
    var dst_shape = [];
    var dst_stride = [];//not use dst._strides because tailing 1 dimension is omitted
    var dst_stride_tmp = 1;
    for (var dim = 0; dim < inds_ndim; dim++) {
      var iter_and_length = Matrix._get_ind_iterator(inds[dim], virtual_input_shape[dim]);
      ind_iters.push(iter_and_length.iter);
      dst_shape.push(iter_and_length.length);
      dst_stride.push(dst_stride_tmp);
      dst_stride_tmp *= iter_and_length.length;
    }

    var dst_reshape_shape = null;
    if (inds_ndim == 1) {
      // linear indexing case
      dst_shape.push(1);//avoid error on new Matrix()
      // if ind is logical matrix, regarded as vector in the following
      // colon is row vector
      // src and ind are both vectors => follows direction of src
      // otherwise: follows ind's shape
      var is_ind_vector = false;
      var only_ind = inds[0];
      if (only_ind instanceof Matrix) {
        if (only_ind._ndims == 2 && (only_ind._size[0] == 1 || only_ind._size[1] == 1)) {
          is_ind_vector = true;
        }
      } else if (only_ind instanceof Colon) {
        is_ind_vector = true;
      }
      var is_src_vector = false;
      if (this._ndims == 2 && (this._size[0] == 1 || this._size[1] == 1)) {
        is_src_vector = true;
      }

      if (is_src_vector && is_ind_vector) {
        // follow direction of src
        if (this._size[0] == 1) {
          // reshape to row vector
          dst_reshape_shape = [1, dst_shape[0]];
        }
      } else {
        // follow ind's shape
        if (only_ind instanceof Matrix) {
          dst_reshape_shape = only_ind._size;
        } else if (only_ind instanceof Colon) {
          // reshape to row vector
          dst_reshape_shape = [1, dst_shape[0]];
        }
      }
    }
    var dst = new Matrix(dst_shape, this._klass);
    var dst_data = dst._data;
    var src_data = this._data;
    var dst_numel = dst._numel;
    for (var dst_idx = 0; dst_idx < dst_numel; dst_idx++) {
      var input_linear_idx = 0;
      for (var dim = 0; dim < inds_ndim; dim++) {
        var dst_coord = Math.floor(dst_idx / dst_stride[dim]) % dst_shape[dim];
        var src_coord = ind_iters[dim](dst_coord) - 1;
        input_linear_idx += src_coord * virtual_input_stride[dim];
      }
      dst_data[dst_idx] = src_data[input_linear_idx];
    }

    if (dst_reshape_shape) {
      dst.reshape_inplace(dst_reshape_shape);
    }

    return dst;
  }

  get_matrix_nd_old(inds: (number | Colon | Matrix)[]): Matrix {
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
        dimidx = dimind.tojsa(this._size[dim] === void 0 ? 1 : this._size[dim]);
      } else if (dimind instanceof Matrix) {
        dimidx = dimind._getdata();
      } else {
        //number
        dimidx = [<number>dimind];
      }

      //range check
      var dimsize: number;
      if (dim == inds.length - 1) {
        // last index is regarded as linear index of remaining dimensions
        dimsize = 1;
        for (var dimex = dim; dimex < this._ndims; dimex++) {
          dimsize *= this._size[dimex];
        }
      } else {
        dimsize = this._size[dim] || 1;//exceed dimension must be [1,1,...]
      }
      for (var i = 0; i < dimidx.length; i++) {
        var dimval = dimidx[i];
        if (dimval < 0) {//$M.end-foo
          dimval += dimsize + 1;
          dimidx[i] = dimval;
        }
        if ((dimval > dimsize) || (dimval < 1)) {
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
      this.set_matrix_nd(val, args);
      // if (args.length > 1) {
      //   this.set_matrix_nd(val, args);
      // } else {
      //   if (args[0] instanceof Matrix && (<Matrix>args[0])._klass === 'logical') {
      //     this.set_matrix_logical(val, args[0]);
      //   } else {
      //     this.set_matrix_single(val, args[0]);
      //   }
      // }
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
      single_idx_array = singleind.getdataref();
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
    var inds_ndim = inds.length;
    // replace logical matrix with vector
    for (var i = 0; i < inds_ndim; i++) {
      var ind = inds[i];
      if (ind instanceof Matrix) {
        if (ind._klass == 'logical') {
          inds[i] = ind._find();
        }
      }
    }

    var virtual_input_shape: number[] = [];
    if (this._ndims <= inds_ndim) {
      // pad with 1
      virtual_input_shape = this._size.concat();
      while (virtual_input_shape.length < inds_ndim) {
        virtual_input_shape.push(1);
      }
    } else {
      // last dimension is like linear index
      let cur_prod = 1;
      for (let dim = 0; dim < inds_ndim - 1; dim++) {
        virtual_input_shape.push(this._size[dim]);
        cur_prod *= this._size[dim];
      }
      virtual_input_shape.push(this._numel / cur_prod);
    }
    var virtual_input_stride: number[] = [];
    var stride_tmp = 1;
    for (var dim = 0; dim < inds_ndim; dim++) {
      virtual_input_stride.push(stride_tmp);
      stride_tmp *= virtual_input_shape[dim];
    }

    var ind_iters = [];
    var dst_shape: number[] = [];
    var dst_stride = [];//not use dst._strides because tailing 1 dimension is omitted
    var dst_stride_tmp = 1;
    for (var dim = 0; dim < inds_ndim; dim++) {
      var iter_and_length = Matrix._get_ind_iterator(inds[dim], virtual_input_shape[dim]);
      ind_iters.push(iter_and_length.iter);
      dst_shape.push(iter_and_length.length);
      dst_stride.push(dst_stride_tmp);
      dst_stride_tmp *= iter_and_length.length;
    }
    var dst_numel = dst_stride_tmp;

    var scalar_val: number = null;
    if (typeof (val) === 'number') {
      scalar_val = <number>val;
    } else if (val instanceof Matrix) {
      if (val._numel === 1) {
        scalar_val = val.valueOf();
      }
    }

    if (scalar_val == null) {
      // set matrix
      // shape check; dimensions excluding value 1 must match
      var dst_shape_exclude_one = dst_shape.filter((v) => v != 1);
      var val_shape_exclude_one = (<Matrix>val)._size.filter((v) => v != 1);
      if (dst_shape_exclude_one.length != val_shape_exclude_one.length) {
        throw Error('Shape mismatch');
      }
      if (!dst_shape_exclude_one.every((v, i) => v == val_shape_exclude_one[i])) {
        throw Error('Shape mismatch');
      }

      var dst_data = (<Matrix>val)._data;
      var src_data = this._data;
      for (var dst_idx = 0; dst_idx < dst_numel; dst_idx++) {
        var input_linear_idx = 0;
        for (var dim = 0; dim < inds_ndim; dim++) {
          var dst_coord = Math.floor(dst_idx / dst_stride[dim]) % dst_shape[dim];
          var src_coord = ind_iters[dim](dst_coord) - 1;
          input_linear_idx += src_coord * virtual_input_stride[dim];
        }
        src_data[input_linear_idx] = dst_data[dst_idx];
      }

    } else {
      // set scalar
      var src_data = this._data;
      for (var dst_idx = 0; dst_idx < dst_numel; dst_idx++) {
        var input_linear_idx = 0;
        for (var dim = 0; dim < inds_ndim; dim++) {
          var dst_coord = Math.floor(dst_idx / dst_stride[dim]) % dst_shape[dim];
          var src_coord = ind_iters[dim](dst_coord) - 1;
          input_linear_idx += src_coord * virtual_input_stride[dim];
        }
        src_data[input_linear_idx] = scalar_val;
      }
    }

  }

  set_matrix_nd_old(val: number | Matrix, inds: (number | Colon | Matrix)[]): void {
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
        dimidx = dimind.tojsa(this._size[dim] || 1);
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
    var rawdata = this.getdataref();
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

  _find(): Matrix {
    // returns nonzero-element indices
    // if this is vector, direction (row/col) is kept.
    // otherwise, column vector is returned.
    var output_length = 0;
    var src_data = this.getdataref();
    for (var i = 0; i < src_data.length; i++) {
      if (src_data[i]) {
        output_length++;
      }
    }

    var dst = new Matrix([output_length, 1], 'int32');
    var dst_idx = 0;
    var dst_data = dst._data;
    for (var i = 0; dst_idx < output_length; i++) {
      if (src_data[i]) {
        dst_data[dst_idx++] = i + 1;
      }
    }
    if (this._size[1] == this._numel) {
      // row vector
      dst.reshape_inplace(this._size);
    }

    return dst;
  }
}

export = Matrix;
