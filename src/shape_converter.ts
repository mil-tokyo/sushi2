import Matrix = require('./matrix');
import util = require('./util');

export function transpose(A: Matrix): Matrix {
  if (A._ndims != 2) {
    throw new Error('Matrix must be two-dimensional');
  }
  A = A.to_cpu();

  var [dst_cols, dst_rows] = A._size;
  var dst = new Matrix([dst_rows, dst_cols], A._klass);

  var a_data = A._data;
  var dst_data = dst._data;
  var i = 0;
  for (var dst_col = 0; dst_col < dst_cols; dst_col++) {
    for (var dst_row = 0; dst_row < dst_rows; dst_row++) {
      dst_data[i] = a_data[dst_row * dst_cols + dst_col];
      i++;
    }

  }

  return dst;
}

export function repmat(A: Matrix, ...rs: number[]): Matrix;
export function repmat(A: Matrix, rs: number[]): Matrix;
export function repmat(A: Matrix, r: Matrix): Matrix;
export function repmat(A: Matrix, ...args: any[]): Matrix {
  A = A.to_cpu();
  //convert to Array
  var _rs: number[];//number of repetion for each dim
  var first_arg = args[0];
  if (first_arg instanceof Matrix) {
    var tarray = first_arg._getdata();
    _rs = Array.prototype.slice.call(tarray);
  } else if (first_arg.length !== void 0) {
    _rs = Array.prototype.slice.call(first_arg);
  } else {
    _rs = Array.prototype.slice.call(args);
  }
  if (_rs.length === 1) {
    //[2] => [2,2]
    _rs.push(_rs[0]);
  }

  while (_rs.length < A._ndims) {
    _rs.push(1);
  }

  var newsize: number[] = [];
  for (var dim = 0; dim < A._ndims; dim++) {
    var dimsize = A._size[dim];
    newsize[dim] = dimsize * _rs[dim];
  }

  var dst = new Matrix(newsize, A._klass);
  return dst;
}
