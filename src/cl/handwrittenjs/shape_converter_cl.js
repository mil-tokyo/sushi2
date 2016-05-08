'use strict';
// overwrites shape conversion functions

var $M = require('../../sushi');
var util = require('../../util');
var util_cl = require('./util_cl');


(function () {
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../../matrix');
  var MatrixCL = require('../matrix_cl');
  var WebCL = $M.CL.WebCL;
  var ctypes = util_cl.ctypes;
  var webcltypes = util_cl.webcltypes;

  var transpose_native = $M.transpose;
  var transpose_cl = function (A) {
    if (A._ndims != 2) {
      throw new Error('Matrix must be two-dimensional');
    }

    var dst_cols = A._size[0], dst_rows = A._size[1];
    var dst = new MatrixCL([dst_rows, dst_cols], A._klass);

    var kernel_name = 'transpose_cl_' + A._klass;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_DST_TYPE ' + ctypes[A._klass],
        '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global SRC_DST_TYPE *src,',
        'uint dst_rows, uint dst_cols, uint length)',
        '{',
        'uint i = get_global_id(0);',
        'if (i >= length) {return;}',
        'uint dst_row = i % dst_rows, dst_col = i / dst_rows;',
        'dst[i] = src[dst_row * dst_cols + dst_col];',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (dst._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: dst },
        { access: WebCL.MEM_READ_ONLY, datum: A },
        { datum: dst_rows, type: WebCL.type.UINT },
        { datum: dst_cols, type: WebCL.type.UINT },
        { datum: dst._numel, type: WebCL.type.UINT }
      ], dst._numel);
    }

    return dst;
  };

  $M.transpose = function (A) {
    if (A instanceof MatrixCL) {
      return transpose_cl(A);
    } else {
      return transpose_native(A);
    }
  }
  $M.t = $M.transpose;

  var repmat_native = $M.repmat;
  var repmat_cl = function (A) {
    //convert to Array
    var _rs;//number of repetion for each dim
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
      args[_i - 1] = arguments[_i];
    }
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
    var newsize = [];
    var input_strides = new Int32Array(newdims+1);
    var output_strides = new Int32Array(newdims+1);
    var tmp_in_stride = 1;
    var tmp_out_stride = 1;
    var n_copy = 1;
    var rs_strides = [];
    for (var dim = 0; dim < newdims; dim++) {
      var indimsize = A._ndims > dim ? A._size[dim] : 1;
      var outdimsize = indimsize * _rs[dim];
      rs_strides.push(n_copy);
      n_copy *= _rs[dim];
      newsize.push(outdimsize);
      input_strides[dim] = (tmp_in_stride);
      output_strides[dim] = (tmp_out_stride);
      tmp_in_stride *= indimsize;
      tmp_out_stride *= outdimsize;
    }
    input_strides[newdims] = (tmp_in_stride);//dummy
    rs_strides.push(n_copy);//dummy

    var output_steps = new Int32Array(n_copy);
    for (var i = 0; i < n_copy; i++) {
      var out_offset = 0;
      for (var dim = 0; dim < newdims; dim++) {
        out_offset += Math.floor(i % rs_strides[dim + 1] / rs_strides[dim]) * output_strides[dim] * (A._size[dim] || 1);
      }
      output_steps[i] = (out_offset);
    }

    var dst = new MatrixCL(newsize, A._klass);
    var kernel_name = 'repmat_cl_' + newdims + '_' + A._klass;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define DIMS ' + newdims,
        '#define SRC_DST_TYPE ' + ctypes[A._klass],
        '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global SRC_DST_TYPE *src,',
        '__global int *input_strides, __global int *output_strides, __global int *output_steps,',
        'uint n_copy, uint length)',
        '{',
        'uint i = get_global_id(0);',
        'if (i >= length) {return;}',
        'int out_offset = 0;',
        'SRC_DST_TYPE val = src[i];',
        'for (int dim = 0; dim < DIMS; dim++) {',
        '  out_offset += i % input_strides[dim+1] / input_strides[dim] * output_strides[dim];',
        '}',
        'for (int j = 0; j < n_copy; j++) {',
        '  dst[out_offset + output_steps[j]] = val;',
        '}',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (dst._numel > 0) {
      var input_strides_mat = MatrixCL._fromtypedarray(input_strides, 'int32');
      var output_strides_mat = MatrixCL._fromtypedarray(output_strides, 'int32');
      var output_steps_mat = MatrixCL._fromtypedarray(output_steps, 'int32');
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: dst },
        { access: WebCL.MEM_READ_ONLY, datum: A },
        { access: WebCL.MEM_READ_ONLY, datum: input_strides_mat },
        { access: WebCL.MEM_READ_ONLY, datum: output_strides_mat },
        { access: WebCL.MEM_READ_ONLY, datum: output_steps_mat },
        { datum: n_copy, type: WebCL.type.UINT },
        { datum: A._numel, type: WebCL.type.UINT }
      ], A._numel);
      input_strides_mat.destruct();
      output_strides_mat.destruct();
      output_steps_mat.destruct();
    }

    return dst;
  };

  $M.repmat = function (A) {
    if (A instanceof MatrixCL) {
      return repmat_cl.apply(null, arguments);
    } else {
      return repmat_native.apply(null, arguments);
    }
  };
})();
