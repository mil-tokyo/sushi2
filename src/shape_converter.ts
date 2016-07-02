import Matrix = require('./matrix');
import util = require('./util');
import colon = require('./colonwrap');

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

  // remove tailing 1
  while ((_rs.length > A._ndims) && (_rs[_rs.length - 1] == 1)) {
    _rs.pop();
  }

  var newdims = _rs.length;
  var newsize: number[] = [];
  var input_strides: number[] = [];
  var output_strides: number[] = [];
  var tmp_in_stride = 1;
  var tmp_out_stride = 1;
  var n_copy = 1;
  var rs_strides: number[] = [];
  for (var dim = 0; dim < newdims; dim++) {
    var indimsize = A._ndims > dim ? A._size[dim] : 1;
    var outdimsize = indimsize * _rs[dim];
    rs_strides.push(n_copy);
    n_copy *= _rs[dim];
    newsize.push(outdimsize);
    input_strides.push(tmp_in_stride);
    output_strides.push(tmp_out_stride);
    tmp_in_stride *= indimsize;
    tmp_out_stride *= outdimsize;
  }
  input_strides.push(tmp_in_stride);//dummy
  rs_strides.push(n_copy);//dummy

  var output_steps: number[] = [];
  for (var i = 0; i < n_copy; i++) {
    var out_offset = 0;
    for (var dim = 0; dim < newdims; dim++) {
      out_offset += Math.floor(i % rs_strides[dim + 1] / rs_strides[dim]) * output_strides[dim] * (A._size[dim] || 1);
    }
    output_steps.push(out_offset);
  }

  var dst = new Matrix(newsize, A._klass);
  var a_data = A._data;
  var dst_data = dst._data;
  for (var i = 0, i_length = A._numel; i < i_length; i++) {
    var a_i = a_data[i];
    var out_offset = 0;
    for (var dim = 0; dim < newdims; dim++) {
      out_offset += Math.floor(i % input_strides[dim + 1] / input_strides[dim]) * output_strides[dim];
    }
    for (var j = 0; j < n_copy; j++) {
      var out_idx = out_offset + output_steps[j];
      dst_data[out_idx] = a_i;
    }

  }
  return dst;
}

export function cat(dim: number, ...As: Matrix[]): Matrix {
  //dimension other than concatenating dimension must be same
  var dst_size = As[0]._size.concat();
  // if dim == 4, [2, 3] => [2, 3, 1, 1]
  while (dst_size.length < dim) {
    dst_size.push(1);
  }
  var concat_offsets = [1];
  for (var i = 1; i < As.length; i++) {
    var A = As[i];
    if (A._numel == 0) {
      concat_offsets.push(0);//not used
      continue;
    }
    var a_size = A._size;
    if (a_size.length > dst_size.length) {
      throw Error('Dimension mismatch');
    }
    for (var d = 0; d < dst_size.length; d++) {
      var a_dim = a_size[d] || 1;
      if (d == dim - 1) {
        // dimension to concat
        concat_offsets.push(dst_size[d] + 1);
        dst_size[d] += a_dim;
      } else {
        if (a_dim != dst_size[d]) {
          throw Error('Dimension mismatch');
        }
      }

    }
  }

  var dst = new Matrix(dst_size, As[0]._klass);
  for (var i = 0; i < As.length; i++) {
    var A = As[i];
    if (A._numel == 0) {
      continue;
    }
    var args: any[] = [];
    for (var d = 0; d < dst_size.length; d++) {
      var element = A._size[d] || 1;
      if (d == dim - 1) {
        args.push(colon(concat_offsets[i], concat_offsets[i] + element - 1));
      } else {
        args.push(colon());
      }
    }
    args.push(A);

    dst.set(...args);
  }

  return dst;
}

export function horzcat(...As: Matrix[]): Matrix {
  return cat(2, ...As);
}

export function vertcat(...As: Matrix[]): Matrix {
  return cat(1, ...As);
}

export function permute(A: Matrix, order: number[]): Matrix {
  var src_size = A._size.concat();
  var numel = A._numel;
  if (order.length < src_size.length) {
    throw Error('order must include at least input dimension');
  }
  var ndim = order.length;
  var src_strides = A._strides.concat();
  while (src_size.length < ndim) {
    //append dimension of 1
    src_size.push(1);
    src_strides.push(numel);
  }
  var dst_size: number[] = [];
  for (var d = 0; d < ndim; d++) {
    var element = order[d] - 1;//order start from 1
    dst_size.push(src_size[element]);
  }

  var dst = new Matrix(dst_size, A._klass);
  var dst_strides = dst._strides.concat();
  while (dst_strides.length < ndim) {
    // occur when last dimensions are 1
    dst_strides.push(numel);
  }
  var dst_strides_perm = [];
  order.forEach((o, i) => dst_strides_perm[o - 1] = dst_strides[i]);
  var src_data = A.getdataref();
  var dst_data = dst._data;
  for (var i = 0; i < numel; i++) {
    var dst_idx = 0;
    for (var d = 0; d < ndim; d++) {
      dst_idx += Math.floor(i / src_strides[d]) % src_size[d] * dst_strides_perm[d];
    }
    dst_data[dst_idx] = src_data[i];
  }
  return dst;
}

export function ipermute(A: Matrix, order: number[]): Matrix {
  // reverse order
  var rev_order = order.concat();//have same elements
  for (var d = 0; d < order.length; d++) {
    rev_order[order[d] - 1] = d + 1;
  }
  return permute(A, rev_order);
}
