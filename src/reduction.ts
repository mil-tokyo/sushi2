import Matrix = require('./matrix');
import util = require('./util');
import func_generator = require('./func_generator');

declare type MatrixOrNumber = Matrix | number;

function max_along_axis(A: Matrix, dim?: number): Matrix {
  if (dim == null) {
    //select first non-1 axis
    dim = A._numel;
    for (var i = 0; i < A._size.length; i++) {
      var dimsize = A._size[i];
      if (dimsize !== 1) {
        dim = i + 1;
        break;
      }
    }
  }

  if (dim > A._ndims) {
    //max along axis with size 1
    return A.copy();
  }

  var dstsize = A._size.slice();
  if (dstsize[dim - 1] !== 0) {
    //size 0 dimension is preserved
    dstsize[dim - 1] = 1;
  }

  if ((A._numel === 0) || (A._size[dim - 1] === 1)) {
    //only change shape
    var dst = A.copy();
    dst.reshape_inplace(dstsize);
    return dst;
  }
  
  //reduction actually needed
  var dst = new Matrix(dstsize, A._klass);
  var input_strides = A._strides;
  var output_strides = dst._strides.slice();
  while (output_strides.length <= input_strides.length) {
    output_strides.push(dst._numel);
  }

  var reduction_step = input_strides[dim - 1];
  var reduction_count = A._size[dim - 1];
  var a_data = A._data;
  var dst_data = dst._data;
  var dims = A._ndims;
  for (var i = 0, dst_numel = dst._numel; i < dst_numel; i++) {
    var input_idx = 0;
    for (var d = 0; d < dims; d++) {
      input_idx += Math.floor(i % output_strides[d + 1] / output_strides[d]) * input_strides[d];
    }

    var curret = a_data[input_idx];
    for (var red = 1; red < reduction_count; red++) {
      input_idx += reduction_step;
      var val = a_data[input_idx];
      if (val > curret) {
        curret = val;
      }
    }

    dst_data[i] = curret;
  }

  return dst;
}

var max_elementwise = func_generator.make_binary_arith_func_all('Math.max(%a,%b)');

export function max(A: MatrixOrNumber, B?: MatrixOrNumber, dim?: number): Matrix {
  if (B == null) {
    //max along axis
    return max_along_axis(util.as_mat(A), dim);
  } else {
    //elementwise max
    return max_elementwise(A, B);
  }
}

export function argmax(A: MatrixOrNumber, dummy?: any, dim?: number): Matrix {
  return null;
}
