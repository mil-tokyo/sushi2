'use strict';
// overwrites shape conversion functions

var $M = require('../sushi');
var util = require('../util');
var util_cl = require('./util_cl');


(function () {
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../matrix');
  var MatrixCL = require('./matrix_cl');
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
})();
