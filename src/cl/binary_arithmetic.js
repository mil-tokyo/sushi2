'use strict';
// overwrites binary arithmetic functions

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

  var binary_arith_cl = function (A, B, name, operator) {
    var dst_klass = util.commonklass(A, B);
    if (dst_klass == 'logical') {
      dst_klass = 'single';
    }
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

    var kernel_name = 'binary_arith_cl_' + name + '_' + (left_isscalar || A._klass) + '_' + (right_isscalar || B._klass) + '_' + dst_klass;
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

  var subsitute_binary_arith = function (name, operator) {
    var func_native = $M[name];
    var func_cl = function (A, B) {
      return binary_arith_cl(A, B, name, operator);
    };
    $M[name] = function (A, B) {
      var ret = $M.autodestruct(function () {
        return util_cl.unify_call(func_native, func_cl, A, B);
      });
      return ret;
    };
  }
  subsitute_binary_arith('plus', '((left) + (right))');
  subsitute_binary_arith('minus', '((left) - (right))');
  subsitute_binary_arith('times', '((left) * (right))');
  subsitute_binary_arith('rdivide', '((left) / (right))');
  subsitute_binary_arith('ldivide', '((right) / (left))');
  subsitute_binary_arith('power', '(pow((float)(left), (float)(right)))');
  $M.CL._max_elementwise_cl = function (A, B) {
    return binary_arith_cl(A, B, 'max_elementwise_cl', '(((left) > (right)) ? (left) : (right))');
  };
  $M.CL._min_elementwise_cl = function (A, B) {
    return binary_arith_cl(A, B, 'min_elementwise_cl', '(((left) < (right)) ? (left) : (right))');
  };


  var compare_cl = function (A, B, name, operator) {
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

    var kernel_name = 'compare_cl_' + name + '_' + (left_isscalar || A._klass) + '_' + (right_isscalar || B._klass);
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define LEFT_TYPE ' + left_type,
        '#define RIGHT_TYPE ' + right_type,
        '#define LEFT_ACCESS(i) ' + (left_isscalar ? 'a' : 'a[(i)]'),
        '#define RIGHT_ACCESS(i) ' + (right_isscalar ? 'b' : 'b[(i)]'),
        '#define OPERATOR(left, right) ' + operator,
        '__kernel void kernel_func(__global uchar *dst, LEFT_TYPE a, RIGHT_TYPE b, uint length) {',
        '  uint i = get_global_id(0);',
        '  if (i >= length) { return; }',
        '  dst[i] = OPERATOR(LEFT_ACCESS(i), RIGHT_ACCESS(i));',
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

    var dst = new MatrixCL(dst_size, 'logical');
    if (dst._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: dst },
        kernel_param_a,
        kernel_param_b,
        { datum: dst._numel, type: WebCL.type.UINT }],
        dst._numel);
    }
    return dst;
  };

  var subsitute_compare = function (name, operator) {
    var func_native = $M[name];
    var func_cl = function (A, B) {
      return compare_cl(A, B, name, operator);
    };
    $M[name] = function (A, B) {
      var ret = $M.autodestruct(function () {
        return util_cl.unify_call(func_native, func_cl, A, B);
      });
      return ret;
    };
  };

  subsitute_compare('eq', '((left) == (right))');
  subsitute_compare('ge', '((left) >= (right))');
  subsitute_compare('gt', '((left) > (right))');
  subsitute_compare('le', '((left) <= (right))');
  subsitute_compare('lt', '((left) < (right))');
  subsitute_compare('ne', '((left) != (right))');

  var isequal_cl_both = function (mats, nan_equal) {
    var A = mats[0];
    var eqmat = new MatrixCL([1, 1], 'logical');
    eqmat.set(1, 0);
    for (var i = 1; i < mats.length; i++) {
      var B = mats[i];
      if (!util.issamesize(A._size, B._size)) {
        return false;
      }

      var kernel_name = 'isequal_cl_' + A._klass + '_' + B._klass + '_' + nan_equal;
      var kernel = MatrixCL.kernel_cache[kernel_name];
      if (!kernel) {
        var condition = 'aval != bval';
        if (nan_equal) {
          if (A._klass === 'single' && B._klass === 'single') {
            condition += '&& !(isnan(aval) && isnan(bval))';//become false if both is nan
          }
        }

        kernel = $CL.createKernel([
          '#define LEFT_TYPE ' + ctypes[A._klass],
          '#define RIGHT_TYPE ' + ctypes[B._klass],
          '__kernel void kernel_func(__global uchar *dst, __global LEFT_TYPE *a, __global RIGHT_TYPE *b, uint length) {',
          '  uint i = get_global_id(0);',
          '  if (i >= length) { return; }',
          '  LEFT_TYPE aval = a[i];',
          '  RIGHT_TYPE bval = b[i];',
          '  if (' + condition + ') {*dst = 1;}',
          '}'
        ].join('\n'));
        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      if (A._numel > 0) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: eqmat },
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { access: WebCL.MEM_READ_ONLY, datum: B },
          { datum: A._numel, type: WebCL.type.UINT }],
          A._numel);
      }
      if (eqmat.get()) {
        //non-equal value found
        return false;
      }
    }
    return true;
  };

  var isequal_cl = function () {
    return isequal_cl_both(arguments, false);
  };

  var isequaln_cl = function () {
    return isequal_cl_both(arguments, true);
  }

  var isequal_native = $M.isequal;
  $M.isequal = function () {
    var mats = arguments;//variable length input
    var ret = $M.autodestruct(function () {
      // Array.concat does not work on array-like (arguments)
      var unify_call_args = [isequal_native, isequal_cl];
      Array.prototype.push.apply(unify_call_args, mats);
      return util_cl.unify_call.apply(null, unify_call_args);
    });
    return ret;
  };
  
  var isequaln_native = $M.isequaln;
  $M.isequaln = function () {
    var mats = arguments;
    var ret = $M.autodestruct(function () {
      var unify_call_args = [isequaln_native, isequaln_cl];
      Array.prototype.push.apply(unify_call_args, mats);
      return util_cl.unify_call.apply(null, unify_call_args);
    });
    return ret;
  };

})();
