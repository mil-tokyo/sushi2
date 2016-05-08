'use strict';
// overwrites unary arithmetic functions

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

  var unary_arith_cl = function (A, name, operator) {
    // A is MatrixCL (not number)
    var dst_klass = A._klass;
    if (dst_klass == 'logical') {
      dst_klass = 'single';
    }

    var kernel_name = 'unary_arith_cl_' + name + '_' + A._klass + '_' + dst_klass;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_TYPE  ' + ctypes[A._klass],
        '#define DST_TYPE ' + ctypes[dst_klass],
        '#define OPERATOR(left) ' + operator,
        '__kernel void kernel_func(__global DST_TYPE *dst, __global SRC_TYPE *a, uint length) {',
        '  uint i = get_global_id(0);',
        '  if (i >= length) { return; }',
        '  dst[i] = (DST_TYPE)OPERATOR(a[i]);',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    var dst = new MatrixCL(A._size, dst_klass);
    if (dst._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: dst },
        {access:WebCL.MEM_READ_ONLY,datum:A},
        { datum: dst._numel, type: WebCL.type.UINT }],
        dst._numel);
    }
    return dst;
  }

  var subsitute_unary_arith = function (name, operator) {
    var func_native = $M[name];
    var func_cl = function (A) {
      return unary_arith_cl(A, name, operator);
    };
    $M[name] = function (A) {
      if (A instanceof MatrixCL) {
        return func_cl(A);
      } else {
        return func_native(A);
      }
    };
  }
  subsitute_unary_arith('uplus', '(left)');
  subsitute_unary_arith('uminus', '-(left)');
  subsitute_unary_arith('floor', 'floor((float)(left))');
  subsitute_unary_arith('fix', '((left) > 0 ? floor((float)(left)): ceil((float)(left)))');
  subsitute_unary_arith('ceil', 'ceil((float)(left))');
  subsitute_unary_arith('exp', 'exp((float)(left))');
  subsitute_unary_arith('log', 'log((float)(left))');

})();
