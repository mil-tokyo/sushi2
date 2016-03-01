import Matrix = require('../matrix');
import $CL = require('./driver');

class MatrixCL extends Matrix {
  _clbuffer: $CL.clBuffer;
  constructor(size: number[], klass?: string) {
    super(size, klass, true);
    this._clbuffer = $CL.createBuffer(this._numel * this._data_ctor.BYTES_PER_ELEMENT);
  }
  
  throw_if_destructed() {
    if (!this._clbuffer) {
      throw new Error('Attempting use destructed matrix');
    }
  }
  
  write(src_typed_array: any, offset?: number) {
    this.throw_if_destructed();
    $CL.writeBuffer(this._clbuffer, src_typed_array, offset);
  }
  
  read(dst_typed_array: any, offset?: number) {
    this.throw_if_destructed();
    $CL.readBuffer(this._clbuffer, dst_typed_array, offset);
  }
  
  destruct() {
    if (this._clbuffer) {
      $CL.releaseBuffer(this._clbuffer);
      this._clbuffer = null;
    }
  }

  get(): number;
  get(...args: number[]): number;
  get(...args: any[]): Matrix;
  get(...args: any[]): any {
    if (args.length == 0) {
      // get scalar
      return this.get_scalar([1]);
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

  get_scalar(inds: number[]): number {
    this._isvalidindexerr(inds);
    var arrayidx = this._getarrayindex(inds);
    var dst_typed_array = new this._data_ctor(1);//read only 1 element
    this.read(dst_typed_array, arrayidx * this._data_ctor.BYTES_PER_ELEMENT);
    return dst_typed_array[0];
    //return rawdata[arrayidx];
  }
}

export = MatrixCL;
