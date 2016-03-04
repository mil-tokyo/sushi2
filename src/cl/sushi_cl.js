'use strict';
// overwrites functions in $M by opencl-aware version

var $M = require('../sushi');
var util = require('../util');
module.exports = $M;

(function () {
  if ($M.CL) {
    return;
  }
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../matrix');
  var MatrixCL = require('./matrix_cl');
  var WebCL = $M.CL.WebCL;
  var ctypes = { single: 'float', int32: 'int', uint8: 'uchar', logical: 'uchar' };
  var webcltypes = { single: WebCL.type.FLOAT, int32: WebCL.type.INT, uint8: WebCL.type.UCHAR, logical: WebCL.type.UCHAR };
  
  // unify matrices into cpu / gpu, number is not changed
  var unify_mats = function (inputs) {
    // determine if MatrixCL exists
    var matcl_exist = false;
    for (var i = 0; i < inputs.length; i++) {
      var mati = inputs[i];
      if (mati instanceof MatrixCL) {
        matcl_exist = true;
        break;
      }
    }

    var unified_mats = { cl: matcl_exist, length: inputs.length };
    if (matcl_exist) {
      // cast all Matrix into MatrixCL
      for (var i = 0; i < inputs.length; i++) {
        var mati = inputs[i];
        if ((mati instanceof Matrix) && !(mati instanceof MatrixCL)) {
          unified_mats[i] = MatrixCL._fromnativemat(mati);
        } else {
          unified_mats[i] = mati;
        }
      }
    } else {
      for (var i = 0; i < inputs.length; i++) {
        var mati = inputs[i];
        unified_mats[i] = mati;
      }
    }

    return unified_mats;
  }

  var unify_call = function (native_func, cl_func) {
    //call function using specified arguments unified
    var unified_mats = unify_mats(Array.prototype.slice.call(arguments, 2));
    if (unified_mats.cl) {
      return cl_func.apply(null, unified_mats);
    } else {
      return native_func.apply(null, unified_mats);
    }
  }

  $M.gpuArray = function (A) {
    var mat = new MatrixCL(A._size, A._klass);
    mat.write(A._data);
    return mat;
  };

  $M.gather = function (A) {
    var mat = new Matrix(A._size, A._klass);
    A.read(mat._data);
    return mat;
  };

  var add_native = $M.add;
  $M.add = function (A, B) {
    var ret = $M.autodestruct(function () {
      return unify_call(add_native, add_cl, A, B);
    });
    return ret;
  };

  var add_cl = function (A, B) {
    var kernel_name = 'add_cl_' + A._klass + '_' + B._klass;
    console.log(kernel_name);
    var dst_klass = util.commonklass(A, B);
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define LEFT_TYPE ' + ctypes[A._klass],
        '#define RIGHT_TYPE ' + ctypes[B._klass],
        '#define DST_TYPE ' + ctypes[dst_klass],
        '__kernel void kernel_func(__global DST_TYPE *dst, __global LEFT_TYPE *a, __global RIGHT_TYPE *b, uint length) {',
        '  uint i = get_global_id(0);',
        '  if (i >= length) { return; }',
        '  dst[i] = (DST_TYPE)(a[i] + b[i]);',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    var dst = new MatrixCL(A._size, dst_klass);
    if (dst._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: dst },
        { access: WebCL.MEM_READ_ONLY, datum: A },
        { access: WebCL.MEM_READ_ONLY, datum: B },
        { datum: dst._numel, type: WebCL.type.UINT }
      ], dst._numel);
    }

    return dst;
  };
})();
