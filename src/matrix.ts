import Colon = require('./colon');

declare type AllowedTypedArray = Float32Array | Int32Array | Uint8Array;

class Matrix {
  _size: number[];
  _ndims: number;
  _numel: number;
  _klass: string;
  _data: AllowedTypedArray;//allocated in constructor
  _strides: number[];// in typedarray index (not byte)

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
    if (!noalloc) {
      this._alloccpu();
    }
  }

  static _isinteger(x) {
    return Math.round(x) == x;
  }

  static _isvalidklass(klass) {
    return klass == 'single' || klass == 'int32' || klass == 'uint8' || klass == 'logical';
  }

  _alloccpu(): AllowedTypedArray {
    // allocate cpu buffer if not exist
    if (!this._data) {
      switch (this._klass) {
        case 'single':
          this._data = new Float32Array(this._numel);
          break;
        case 'int32':
          this._data = new Int32Array(this._numel);
          break;
        case 'uint8':
        case 'logical':
          this._data = new Uint8Array(this._numel);
          break;
        default:
          throw new Error('Unknown data class');
      }
    }

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
    // get dimension
    var mat;
    if (ary.length == 0) {
      //0x0 matrix
      mat = new Matrix([0, 0], klass);
    } else if (ary[0].length === void 0) {
      //1-d array
      var vecshape = one_d_column ? [ary.length, 1] : [1, ary.length];
      mat = new Matrix(vecshape, klass);
      for (var i = 0; i < ary.length; i++) {
        mat.set_scalar(i + 1, ary[i]);
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
          mat.set_scalar(row + 1, col + 1, val);
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
          ary.push(this.get_scalar(row + 1, 1));
        }
        flattened = true;
      } else if (this._numel == this._size[1]) {
        //row vector
        for (var col = 0; col < this._size[1]; col++) {
          ary.push(this.get_scalar(1, col + 1));
        }
        flattened = true;
      }
    }

    if (!flattened) {
      for (var row = 0; row < this._size[0]; row++) {
        var rowary = [];
        for (var col = 0; col < this._size[1]; col++) {
          rowary.push(this.get_scalar(row + 1, col + 1));
        }
        ary.push(rowary);
      }
    }
    return ary;
  }

  get(...args: any[]): number | Matrix {
    if (args.length == 0) {
      throw new Error('At least one argument have to be specified');
    }
    var all_number = args.every((v) => typeof (v) === 'number');
    if (all_number) {
      return this.get_scalar(...args);
    } else {
      return this.get_matrix(...args);
    }
  }

  get_scalar(...inds: number[]): number {
    var rawdata = this._alloccpu();
    this._isvalidindexerr(inds);
    var arrayidx = this._getarrayindex(inds);
    return rawdata[arrayidx];
  }

  get_matrix(...inds: (number | Colon | Matrix)[]): Matrix {
    if (inds.length == 1) {
      return this.get_matrix_single(<Colon | Matrix>inds[0]);
    } else {
      //multidim indexing
      //convert index of each dimension into array
      var eachdimidx: (number[] | AllowedTypedArray)[] = [];
      var eachdimstride: number[] = [];
      var output_size = [];
      var output_length = 1;
      var inputdimctr: number[] = [];
      for (var dim = 0; dim < inds.length; dim++) {
        var dimind = inds[dim];
        var dimidx;
        if (dimind instanceof Colon) {
          dimidx = dimind.tojsa(this._size[dim]);
        } else if (dimind instanceof Matrix) {
          dimidx = dimind._data;
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

  set(...args: any[]): void {
    this.set_scalar(...args);
  }

  set_scalar(...inds_val: number[]): void {
    var rawdata = this._alloccpu();
    var inds = inds_val.concat();
    var val = inds.pop();
    this._isvalidindexerr(inds);
    var arrayidx = this._getarrayindex(inds);
    if (this._klass == 'logical') {
      val = Number(Boolean(val));
    }
    rawdata[arrayidx] = val;
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
}

export = Matrix;
