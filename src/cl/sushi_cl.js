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

  var plus_native = $M.plus;
  $M.plus = function (A, B) {
    var ret = $M.autodestruct(function () {
      return unify_call(plus_native, plus_cl, A, B);
    });
    return ret;
  };
  
  var binary_arith_cl = function (A, B, name, operator) {
    var dst_klass = util.commonklass(A, B);
    var left_type, right_type;
    var left_scalar = null, right_scalar = null;
    var left_isscalar = true, right_isscalar = true;
    var kernel_param_a, kernel_param_b;
    if (A instanceof Matrix) {
      if (A._numel == 1) {
        left_type = ctypes[dst_klass];
        left_scalar = A.get();
      } else {
        left_type = '__global ' + ctypes[A._klass] + ' *';
        kernel_param_a = { access: WebCL.MEM_READ_ONLY, datum: A };
        left_isscalar = false;
      }
    } else {
      left_type = ctypes[dst_klass];
      left_scalar = A;
    }
    if (left_isscalar) {
      kernel_param_a = { datum: MatrixCL.cast_scalar_val(left_scalar, dst_klass), type: webcltypes[dst_klass] };
    }

    if (B instanceof Matrix) {
      if (B._numel == 1) {
        right_type = ctypes[dst_klass];
        right_scalar = B.get();
      } else {
        right_type = '__global ' + ctypes[B._klass] + ' *';
        kernel_param_b = { access: WebCL.MEM_READ_ONLY, datum: B };
        right_isscalar = false;
      }
    } else {
      right_type = ctypes[dst_klass];
      right_scalar = B;
    }
    if (right_isscalar) {
      kernel_param_b = { datum: MatrixCL.cast_scalar_val(right_scalar, dst_klass), type: webcltypes[dst_klass] };
    }

    var kernel_name = 'binary_arith_cl_' + name + '_' + (left_isscalar || A._klass) + '_' + (right_isscalar || B._klass);
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define LEFT_TYPE ' + left_type,
        '#define RIGHT_TYPE ' + right_type,
        '#define DST_TYPE ' + ctypes[dst_klass],
        '#define LEFT_ACCESS(i) ' + (left_isscalar ? 'a' : 'a[(i)]'),
        '#define RIGHT_ACCESS(i) ' + (right_isscalar ? 'b' : 'b[(i)]'),
        '#define OPERATOR(left, right) ' + operator,
        '__kernel void kernel_func(__global DST_TYPE *dst, LEFT_TYPE a, RIGHT_TYPE b, uint length) {',
        '  uint i = get_global_id(0);',
        '  if (i >= length) { return; }',
        '  dst[i] = (DST_TYPE)OPERATOR(LEFT_ACCESS(i), RIGHT_ACCESS(i));',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    var dst_size;
    if (left_isscalar) {
      if (right_isscalar) {
        dst_size = [1, 1];
      } else {
        dst_size = B._size;
      }
    } else {
      dst_size = A._size;
      if (!right_isscalar) {
        // both matrix; size check
        if (!util.issamesize(A._size, B._size)) {
          throw new Error('Dimension mismatch');
        }
      }
    }

    var dst = new MatrixCL(dst_size, dst_klass);
    if (dst._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: dst },
        kernel_param_a,
        kernel_param_b,
        { datum: dst._numel, type: WebCL.type.UINT }],
        dst._numel);
    }
    return dst; 
  }

  var plus_cl = function (A, B) {
    return binary_arith_cl(A, B, 'plus', '((left) + (right))');
  };
})();
