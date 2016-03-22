import Matrix = require('./matrix');
import util = require('./util');

export function mtimes(A: Matrix, B: Matrix): Matrix {
  if (A._ndims != 2 || B._ndims != 2) {
    throw new Error('Matrix must be two-dimensional');
  }

  if (A._size[1] != B._size[0]) {
    throw new Error('Shape mismatch');
  }

  if (A._klass != 'single' || B._klass != 'single') {
    throw new Error('Matrix klass must be single');
  }

  var m = A._size[0], n = B._size[1], k = A._size[1];
  var lda = A._strides[1];
  var ldb = B._strides[1];
  var data_a = A._data;
  var data_b = B._data;
  var dst = new Matrix([m, n], 'single');
  var ldc = dst._strides[1];
  var data_c = dst._data;

  for (var i = 0; i < m; i++) {
    for (var j = 0; j < n; j++) {
      var sum = 0;
      for (var r = 0; r < k; r++) {
        sum += data_a[i + r * lda] * data_b[r + j * ldb];
      }
      data_c[i + j * ldc] = sum;
    }
  }

  return dst;
}
