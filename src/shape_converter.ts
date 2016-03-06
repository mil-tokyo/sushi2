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
