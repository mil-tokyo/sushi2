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
