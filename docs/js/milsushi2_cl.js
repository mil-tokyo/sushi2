/*!
 Sushi2 library (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
 clBLAS library Copyright 2013 Advanced Micro Devices, Inc., Apache License Version 2.0.
*/

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.milsushi2 = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Sushi = require('./src/sushi');
module.exports = Sushi;

},{"./src/sushi":21}],2:[function(require,module,exports){
'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
// overwrites binary arithmetic functions

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

},{"../../matrix":16,"../../sushi":21,"../../util":22,"../matrix_cl":11,"./driver":4,"./util_cl":10}],3:[function(require,module,exports){
'use strict';
/* ************************************************************************
 * This is the JavaScript porting of sgemm code in clBLAS.
 * Ported by Machine Intelligence Laboratory (The University of Tokyo)
 * Original license is the following:
 * Copyright 2013 Advanced Micro Devices, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ************************************************************************/

(function () {
  var $M = require('../../sushi');
  var util = require('../../util');
  var util_cl = require('./util_cl');
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../../matrix');
  var MatrixCL = require('../matrix_cl');
  var WebCL = $M.CL.WebCL;
  var ctypes = util_cl.ctypes;
  var webcltypes = util_cl.webcltypes;

  var select_macroTileNumRowsCols = function (m, n) {
    var size_limits = [4000, 2448, 1600, 1008, 960, 896, 864, 784, 768, 720, 464, 304, 0];
    var fallback = [96, 96, 96, 96, 32, 32, 32, 32, 32, 32, 48, 32, 16];
    var divisors = [[96],//4000
      [96],//2448
      [96, 64, 80],//1600
      [96, 64, 80, 48],//1008
      [64, 48, 80, 32],//960
      [64, 96, 48, 80, 32],//896
      [96, 48, 80, 64, 32],//864
      [48, 80, 64, 32, 16],//784
      [48, 80, 64, 32, 16],//768
      [64, 80, 96, 48],//720
      [48, 64, 32, 80],//464
      [48, 32, 16],//304
      [16]];//0
    
    for (var index = 0; index < size_limits.length; index++) {
      var size_limit = size_limits[index];
      if (m * n < size_limit * size_limit) {
        continue;
      }
      var divisor = divisors[index];
      for (var j = 0; j < divisor.length; j++) {
        var div = divisor[j];
        if (m % div == 0 && n % div == 0) {
          return div;
        }
      }

      return fallback[index];
    }

    return 16;//not reachable
  }

  var sgemm = function (transa, transb, m, n, k, alpha, A, ldA, B, ldB, beta, C, ldC, offsetA, offsetB, offsetC) {
    //console.log('sgemm ' + transa + transb + ',' + m + ',' + n + ',' + k);
    offsetA = offsetA | 0;
    offsetB = offsetB | 0;
    offsetC = offsetC | 0;
    var betazero = '1';
    var caccess = WebCL.MEM_READ_WRITE;
    if (beta == 0) {
      betazero = '0';
      caccess = WebCL.MEM_WRITE_ONLY;
    }
    var workGroupNumRows = 16, workGroupNumCols = 16;
    var macroTileNumRowsCols = select_macroTileNumRowsCols(m, n);
    var unroll = 1;
    if (k % 16 == 0) {
      unroll = 16;
    } else if (k % 8 == 0) {
      unroll = 8;
    }
    if (macroTileNumRowsCols == 96 && unroll == 16) {
      unroll = 8;//the combination very slow on S9170 GPU
    }

    var macroTileNumRows = macroTileNumRowsCols, macroTileNumCols = macroTileNumRowsCols;
    var globalWorkSizeRows = Math.floor(m / macroTileNumRows) * workGroupNumRows;
    var globalWorkSizeCols = Math.floor(n / macroTileNumCols) * workGroupNumCols;
    if (globalWorkSizeRows > 0 && globalWorkSizeCols > 0) {
      //console.log('sgemm_Row_' + transa + transb + '_B' + betazero + '_MX' + macroTileNumRows + '_NX' + macroTileNumCols + '_KX' + unroll);
      var kernel_tile = getgemmkernel('sgemm_Col_' + transa + transb + '_B' + betazero + '_MX' + macroTileNumRows + '_NX' + macroTileNumCols + '_KX' + unroll);
      $CL.executeKernel(
        kernel_tile,
        [
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { access: WebCL.MEM_READ_ONLY, datum: B },
          { access: caccess, datum: C },
          { datum: alpha, type: WebCL.type.FLOAT },//alpha
          { datum: beta, type: WebCL.type.FLOAT },//beta=0
          { datum: m, type: WebCL.type.UINT },//M
          { datum: n, type: WebCL.type.UINT },//N
          { datum: k, type: WebCL.type.UINT },//K
          { datum: ldA, type: WebCL.type.UINT },//lda
          { datum: ldB, type: WebCL.type.UINT },//ldb
          { datum: ldC, type: WebCL.type.UINT },//ldc
          { datum: offsetA, type: WebCL.type.UINT },//offseta
          { datum: offsetB, type: WebCL.type.UINT },//offsetb
          { datum: offsetC, type: WebCL.type.UINT },//offsetc
        ],
        [globalWorkSizeRows, globalWorkSizeCols],
        [workGroupNumRows, workGroupNumCols]
        );
    }
    if (m % macroTileNumRows != 0 && globalWorkSizeCols > 0) {
      var kernel_row = getgemmkernel('sgemm_Col_' + transa + transb + '_B' + betazero + '_ML' + macroTileNumRows + '_NX' + macroTileNumCols + '_KX' + unroll);
      $CL.executeKernel(
        kernel_row,
        [
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { access: WebCL.MEM_READ_ONLY, datum: B },
          { access: caccess, datum: C },
          { datum: alpha, type: WebCL.type.FLOAT },//alpha
          { datum: beta, type: WebCL.type.FLOAT },//beta=0
          { datum: m, type: WebCL.type.UINT },//M
          { datum: n, type: WebCL.type.UINT },//N
          { datum: k, type: WebCL.type.UINT },//K
          { datum: ldA, type: WebCL.type.UINT },//lda
          { datum: ldB, type: WebCL.type.UINT },//ldb
          { datum: ldC, type: WebCL.type.UINT },//ldc
          { datum: offsetA, type: WebCL.type.UINT },//offseta
          { datum: offsetB, type: WebCL.type.UINT },//offsetb
          { datum: offsetC, type: WebCL.type.UINT },//offsetc
        ],
        [workGroupNumRows, globalWorkSizeCols],
        [workGroupNumRows, workGroupNumCols]
        );
    }

    if (globalWorkSizeRows > 0 && n % macroTileNumCols != 0) {
      var kernel_col = getgemmkernel('sgemm_Col_' + transa + transb + '_B' + betazero + '_MX' + macroTileNumRows + '_NL' + macroTileNumCols + '_KX' + unroll);
      $CL.executeKernel(
        kernel_col,
        [
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { access: WebCL.MEM_READ_ONLY, datum: B },
          { access: caccess, datum: C },
          { datum: alpha, type: WebCL.type.FLOAT },//alpha
          { datum: beta, type: WebCL.type.FLOAT },//beta=0
          { datum: m, type: WebCL.type.UINT },//M
          { datum: n, type: WebCL.type.UINT },//N
          { datum: k, type: WebCL.type.UINT },//K
          { datum: ldA, type: WebCL.type.UINT },//lda
          { datum: ldB, type: WebCL.type.UINT },//ldb
          { datum: ldC, type: WebCL.type.UINT },//ldc
          { datum: offsetA, type: WebCL.type.UINT },//offseta
          { datum: offsetB, type: WebCL.type.UINT },//offsetb
          { datum: offsetC, type: WebCL.type.UINT },//offsetc
        ],
        [globalWorkSizeRows, workGroupNumCols],
        [workGroupNumRows, workGroupNumCols]
        );
    }
    if ((m % macroTileNumRows != 0) && (n % macroTileNumCols != 0)) {
      var kernel_corner = getgemmkernel('sgemm_Col_' + transa + transb + '_B' + betazero + '_ML' + macroTileNumRows + '_NL' + macroTileNumCols + '_KX' + unroll);
      $CL.executeKernel(
        kernel_corner,
        [
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { access: WebCL.MEM_READ_ONLY, datum: B },
          { access: caccess, datum: C },
          { datum: alpha, type: WebCL.type.FLOAT },//alpha
          { datum: beta, type: WebCL.type.FLOAT },//beta=0
          { datum: m, type: WebCL.type.UINT },//M
          { datum: n, type: WebCL.type.UINT },//N
          { datum: k, type: WebCL.type.UINT },//K
          { datum: ldA, type: WebCL.type.UINT },//lda
          { datum: ldB, type: WebCL.type.UINT },//ldb
          { datum: ldC, type: WebCL.type.UINT },//ldc
          { datum: offsetA, type: WebCL.type.UINT },//offseta
          { datum: offsetB, type: WebCL.type.UINT },//offsetb
          { datum: offsetC, type: WebCL.type.UINT },//offsetc
        ],
        [workGroupNumRows, workGroupNumCols],
        [workGroupNumRows, workGroupNumCols]
        );
    }
  };

  $M.CL.sgemm = sgemm;

  var mtimes_native = $M.mtimes;
  var mtimes_cl = function (A, B) {
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
    var C = new MatrixCL([m, n], 'single');
    var lda = A._strides[1];
    var ldb = B._strides[1];
    var ldc = C._strides[1];
    sgemm('N', 'N', m, n, k, 1.0, A, lda, B, ldb, 0.0, C, ldc);
    return C;
  };

  $M.mtimes = function (A, B) {
    return $M.autodestruct(function () {
      return util_cl.unify_call(mtimes_native, mtimes_cl, A, B);
    });
  };

  var getgemmkernel = function () {
    var kernels = {};

    var KernelParameters = function (name) {
      this.name = name;//cgemm_Col_CC_B0_ML080_NL080_KX08
      var items = name.split('_');
      this.precision = items[0].substr(0, 1);
      this.microTileNumRows = parseInt(items[4].substr(2), 10) / this.workGroupNumRows;
      this.microTileNumCols = parseInt(items[5].substr(2), 10) / this.workGroupNumCols;
      this.unroll = parseInt(items[6].substr(2), 10);
      this.localRowPad = 0;
      this.localColPad = 0;
      this.order = items[1] == 'Col' ? 'clblasColumnMajor' : 'clblasRowMajor';
      this.transA = items[2].substr(0, 1);
      this.transB = items[2].substr(1, 1);
      this.beta = parseInt(items[3].substr(1, 1), 10);
      this._isRowKernel = items[4].substr(1, 1) == 'L';
      this._isColKernel = items[5].substr(1, 1) == 'L';
    };

    KernelParameters.prototype.workGroupNumRows = 16;
    KernelParameters.prototype.workGroupNumCols = 16;

    KernelParameters.prototype.isValid = function () {
      return true;
    };

    KernelParameters.prototype.getName = function () {
      return this.name;
    };

    KernelParameters.prototype.isRowKernel = function () {
      return this._isRowKernel;
    };

    KernelParameters.prototype.isColKernel = function () {
      return this._isColKernel;
    };

    var Common = {};
    Common.hostDataChar = { "s": "s", "d": "d", "c": "c", "z": "z" };
    Common.hostDataType = { "s": "float", "d": "double", "c": "float2", "z": "double2" };
    Common.openclDataType = { "s": "float", "d": "double", "c": "float2", "z": "double2" };

    Common.precisionInt = { "s": 0, "d": 1, "c": 2, "z": 3 };
    Common.orderInt = { "clblasRowMajor": 0, "clblasColumnMajor": 1 };
    Common.transposeInt = { "N": 0, "T": 1, "C": 2 };

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Make OpenCL Kernel String
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    function makeOpenCLKernelString(kernel) {
      //var endLine = "\\n\"\n\"";
      var endLine = "\n";

      ////////////////////////////////////////////////////////////////////////
      // parameters valid?
      if (kernel.isValid() == false) {
        return kernel.getName() + " invalid";
      }

      ////////////////////////////////////////////////////////////////////////
      // initializations
      var kStr = "";
      kStr += endLine;
      kStr += "/* " + kernel.getName() + " */";
      kStr += endLine;

      ////////////////////////////////////////////////////////////////////////
      // Double precision pragma
      var prec = kernel.precision;
      if (prec == "d" || prec == "z") {
        kStr += endLine;
        kStr += "//pragma OPENCL EXTENSION cl_khr_fp64 : enable" + endLine;
      }

      ////////////////////////////////////////////////////////////////////////
      // kernel parameters
      kStr += endLine;
      kStr += "/* kernel parameters */" + endLine;
      //if kernel.order == "clblasColumnMajor":
      //  kStr += "#define COLUMN_MAJOR          1" + endLine
      //else:
      //  kStr += "#define COLUMN_MAJOR          0" + endLine
      //if kernel.transA == "T":
      //  kStr += "#define TRANSPOSE_A           1" + endLine
      //else:
      //  kStr += "#define TRANSPOSE_A           0" + endLine
      //if kernel.transB == "T":
      //  kStr += "#define TRANSPOSE_B           1" + endLine
      //else:
      //  kStr += "#define TRANSPOSE_B           0" + endLine
      //kStr += "" + endLine
      kStr += "#define WG_NUM_ROWS          " + (kernel.workGroupNumRows + endLine);
      kStr += "#define WG_NUM_COLS          " + (kernel.workGroupNumCols + endLine);
      kStr += "#define MICRO_TILE_NUM_ROWS  " + (kernel.microTileNumRows + endLine);
      kStr += "#define MICRO_TILE_NUM_COLS  " + (kernel.microTileNumCols + endLine);
      kStr += "#define MACRO_TILE_NUM_ROWS  " + ((kernel.workGroupNumRows * kernel.microTileNumRows) + endLine);
      kStr += "#define MACRO_TILE_NUM_COLS  " + ((kernel.workGroupNumCols * kernel.microTileNumCols) + endLine);
      kStr += "#define NUM_UNROLL_ITER      " + (kernel.unroll + endLine);
      kStr += "" + endLine;
      kStr += "#define LOCAL_ROW_PAD        " + (kernel.localRowPad + endLine);
      kStr += "#define LOCAL_COL_PAD        " + (kernel.localColPad + endLine);

      ////////////////////////////////////////////////////////////////////////
      // global memory indices
      // A
      kStr += endLine;
      kStr += "/* global memory indices */" + endLine;
      if ((kernel.order == "clblasColumnMajor") == (kernel.transA == "N")) {
        kStr += "#define GET_GLOBAL_INDEX_A(ROW,COL) ((COL)*lda+(ROW))" + endLine;
      } else {
        kStr += "#define GET_GLOBAL_INDEX_A(ROW,COL) ((ROW)*lda+(COL))" + endLine;
      }
      // B
      if ((kernel.order == "clblasColumnMajor") == (kernel.transB == "N")) {
        kStr += "#define GET_GLOBAL_INDEX_B(ROW,COL) ((COL)*ldb+(ROW))" + endLine;
      } else {
        kStr += "#define GET_GLOBAL_INDEX_B(ROW,COL) ((ROW)*ldb+(COL))" + endLine;
      }
      // C
      if (kernel.order == "clblasColumnMajor") {
        kStr += "#define GET_GLOBAL_INDEX_C(ROW,COL) ((COL)*ldc+(ROW))" + endLine;
      } else {
        kStr += "#define GET_GLOBAL_INDEX_C(ROW,COL) ((ROW)*ldc+(COL))" + endLine;
      }

      ////////////////////////////////////////////////////////////////////////
      // local memory indices
      // A
      kStr += endLine;
      kStr += "/* local memory indices */" + endLine;
      kStr += "#define GET_LOCAL_INDEX_A(ROW,COL) ((ROW) + (COL)*((MACRO_TILE_NUM_ROWS)+(LOCAL_COL_PAD)) )" + endLine;
      // B
      kStr += "#define GET_LOCAL_INDEX_B(ROW,COL) ((COL) + (ROW)*((MACRO_TILE_NUM_COLS)+(LOCAL_ROW_PAD)) )" + endLine;

      ////////////////////////////////////////////////////////////////////////
      // data types
      kStr += endLine;
      kStr += "/* data types */" + endLine;
      kStr += "#define DATA_TYPE_STR " + (Common.openclDataType[kernel.precision] + endLine);
      if (kernel.precision == "s" || kernel.precision == "d") {
        // real arithmetic
        kStr += "#define TYPE_MAD(MULA,MULB,DST) DST = mad(MULA,MULB,DST);" + endLine;
        if (kernel.beta == 1) {
          kStr += "#define TYPE_MAD_WRITE(DST,ALPHA,REG,BETA) DST = (ALPHA)*(REG) + (BETA)*(DST);" + endLine;
        } else {
          kStr += "#define TYPE_MAD_WRITE(DST,ALPHA,REG,BETA) DST = (ALPHA)*(REG);" + endLine;
        }
      } else {
        // complex arithmetic
        if (kernel.transA != "C" && kernel.transB != "C") {
          // neither conjugate
          kStr += (
            "#define TYPE_MAD(MULA,MULB,DST) \\" + endLine +
            "  DST.s0 = mad(  MULA.s0, MULB.s0, DST.s0 ); \\" + endLine +
            "  DST.s0 = mad( -MULA.s1, MULB.s1, DST.s0 ); \\" + endLine +
            "  DST.s1 = mad(  MULA.s0, MULB.s1, DST.s1 ); \\" + endLine +
            "  DST.s1 = mad(  MULA.s1, MULB.s0, DST.s1 );" + endLine);
        } else if (kernel.transA == "C" && kernel.transB != "C") {
          // A conjugate (negate imaginary A.s1)
          kStr += (
            "#define TYPE_MAD(MULA,MULB,DST) \\" + endLine +
            "  DST.s0 = mad(  MULA.s0, MULB.s0, DST.s0 ); \\" + endLine +
            "  DST.s0 = mad(  MULA.s1, MULB.s1, DST.s0 ); \\" + endLine +
            "  DST.s1 = mad(  MULA.s0, MULB.s1, DST.s1 ); \\" + endLine +
            "  DST.s1 = mad( -MULA.s1, MULB.s0, DST.s1 );" + endLine);
        } else if (kernel.transA != "C" && kernel.transB == "C") {
          // B conjugate (negate imaginary B.s1)
          kStr += (
            "#define TYPE_MAD(MULA,MULB,DST) \\" + endLine +
            "  DST.s0 = mad(  MULA.s0,  MULB.s0, DST.s0 ); \\" + endLine +
            "  DST.s0 = mad( -MULA.s1, -MULB.s1, DST.s0 ); \\" + endLine +
            "  DST.s1 = mad(  MULA.s0, -MULB.s1, DST.s1 ); \\" + endLine +
            "  DST.s1 = mad(  MULA.s1,  MULB.s0, DST.s1 );" + endLine);
        } else {
          // A & B conjugate (negate imaginary .s1)
          kStr += (
            "#define TYPE_MAD(MULA,MULB,DST) \\" + endLine +
            "  DST.s0 = mad(  MULA.s0,  MULB.s0, DST.s0 ); \\" + endLine +
            "  DST.s0 = mad(  MULA.s1, -MULB.s1, DST.s0 ); \\" + endLine +
            "  DST.s1 = mad(  MULA.s0, -MULB.s1, DST.s1 ); \\" + endLine +
            "  DST.s1 = mad( -MULA.s1,  MULB.s0, DST.s1 );" + endLine);
        }
        if (kernel.beta == 1) {
          kStr += (
            "#define TYPE_MAD_WRITE( DST, ALPHA, REG, BETA ) \\" + endLine +
            "  /* (1) */ \\" + endLine +
            "  type_mad_tmp = REG.s0; \\" + endLine +
            "  REG.s0 *= ALPHA.s0; \\" + endLine +
            "  REG.s0 = mad( -ALPHA.s1, REG.s1, REG.s0 ); \\" + endLine +
            "  REG.s1 *= ALPHA.s0; \\" + endLine +
            "  REG.s1 = mad(  ALPHA.s1, type_mad_tmp, REG.s1 ); \\" + endLine +
            "  /* (2) */ \\" + endLine +
            "  REG.s0 = mad(  BETA.s0, DST.s0, REG.s0 ); \\" + endLine +
            "  REG.s0 = mad( -BETA.s1, DST.s1, REG.s0 ); \\" + endLine +
            "  REG.s1 = mad(  BETA.s1, DST.s0, REG.s1 ); \\" + endLine +
            "  REG.s1 = mad(  BETA.s0, DST.s1, REG.s1 ); \\" + endLine +
            "  /* (3) */ \\" + endLine +
            "  DST = REG;" + endLine);
        } else {
          kStr += (
            "#define TYPE_MAD_WRITE( DST, ALPHA, REG, BETA ) \\" + endLine +
            "  /* (1) */ \\" + endLine +
            "  type_mad_tmp = REG.s0; \\" + endLine +
            "  REG.s0 *= ALPHA.s0; \\" + endLine +
            "  REG.s0 = mad( -ALPHA.s1, REG.s1, REG.s0 ); \\" + endLine +
            "  REG.s1 *= ALPHA.s0; \\" + endLine +
            "  REG.s1 = mad(  ALPHA.s1, type_mad_tmp, REG.s1 ); \\" + endLine +
            "  /* (2) */ \\" + endLine +
            "  REG.s0 = mad(  BETA.s0, DST.s0, REG.s0 ); \\" + endLine +
            "  REG.s0 = mad( -BETA.s1, DST.s1, REG.s0 ); \\" + endLine +
            "  REG.s1 = mad(  BETA.s1, DST.s0, REG.s1 ); \\" + endLine +
            "  REG.s1 = mad(  BETA.s0, DST.s1, REG.s1 ); \\" + endLine +
            "  /* (3) */ \\" + endLine +
            "  DST = REG;" + endLine);
        }
      }

      ////////////////////////////////////////////////////////////////////////
      // micro-tile
      kStr += endLine;
      kStr += "/* " + kernel.microTileNumRows + "x" + kernel.microTileNumCols + " micro-tile */" + endLine;
      kStr += "#define MICRO_TILE \\" + endLine;
      for (var a = 0; a < kernel.microTileNumRows; a++) {
        kStr += "  rA[" + a + "] = localA[offA + " + a + "*WG_NUM_ROWS]; \\" + endLine;
      }
      for (var b = 0; b < kernel.microTileNumCols; b++) {
        kStr += "  rB[" + b + "] = localB[offB + " + b + "*WG_NUM_COLS]; \\" + endLine;
      }
      kStr += "  offA += (MACRO_TILE_NUM_ROWS+LOCAL_COL_PAD); \\" + endLine;
      kStr += "  offB += (MACRO_TILE_NUM_COLS+LOCAL_ROW_PAD); \\" + endLine;
      for (var a = 0; a < kernel.microTileNumRows; a++) {
        for (var b = 0; b < kernel.microTileNumCols; b++) {
          kStr += "  TYPE_MAD(rA[" + a + "],rB[" + b + "],rC[" + a + "][" + b + "]); \\" + endLine;

        }
      }
      kStr += "  mem_fence(CLK_LOCAL_MEM_FENCE);" + endLine;
      kStr += endLine;

      ////////////////////////////////////////////////////////////////////////
      // function signature
      ////////////////////////////////////////////////////////////////////////
      kStr += "__attribute__((reqd_work_group_size(WG_NUM_COLS,WG_NUM_ROWS,1)))" + endLine;
      kStr += "__kernel void kernel_func"// + ( kernel.getName() ) // for sushi_cl function name restriction
      kStr += "(" + endLine;
      // arguments
      kStr += (
        "  __global DATA_TYPE_STR const * restrict A," + endLine +
        "  __global DATA_TYPE_STR const * restrict B," + endLine +
        "  __global DATA_TYPE_STR       *          C," + endLine +
        "  DATA_TYPE_STR const alpha," + endLine +
        "  DATA_TYPE_STR const beta," + endLine +
        "  uint const M," + endLine +
        "  uint const N," + endLine +
        "  uint const K," + endLine +
        "  uint const lda," + endLine +
        "  uint const ldb," + endLine +
        "  uint const ldc," + endLine +
        "  uint const offsetA," + endLine +
        "  uint const offsetB," + endLine +
        "  uint const offsetC" + endLine +
        ") {" + endLine);

      ////////////////////////////////////////////////////////////////////////
      // apply offsets
      kStr += endLine;
      kStr += (
        "  /* apply offsets */" + endLine +
        "  A += offsetA;" + endLine +
        "  B += offsetB;" + endLine +
        "  C += offsetC;" + endLine);

      ////////////////////////////////////////////////////////////////////////
      // allocate registers
      kStr += endLine;
      kStr += (
        "  /* allocate registers */" + endLine +
        "  DATA_TYPE_STR rC[MICRO_TILE_NUM_ROWS][MICRO_TILE_NUM_COLS] = { {0} };" + endLine +
        "  DATA_TYPE_STR rA[MICRO_TILE_NUM_ROWS];" + endLine +
        "  DATA_TYPE_STR rB[MICRO_TILE_NUM_COLS];" + endLine);

      ////////////////////////////////////////////////////////////////////////
      // allocate local memory
      kStr += endLine;
      kStr += (
        "  /* allocate local memory */" + endLine +
        "  __local DATA_TYPE_STR localA[NUM_UNROLL_ITER*(MACRO_TILE_NUM_ROWS+LOCAL_COL_PAD)];" + endLine +
        "  __local DATA_TYPE_STR localB[NUM_UNROLL_ITER*(MACRO_TILE_NUM_COLS+LOCAL_ROW_PAD)];" + endLine);

      ////////////////////////////////////////////////////////////////////////
      // work item indices
      kStr += endLine;
      kStr += "  /* work item indices */" + endLine;
      if (kernel.isRowKernel()) {
        kStr += "  uint groupRow = M / " + (kernel.workGroupNumRows * kernel.microTileNumRows) + "; // last row" + endLine;
      } else {
        kStr += "  uint groupRow = get_group_id(0);" + endLine;
      }
      if (kernel.isColKernel()) {
        kStr += "  uint groupCol = N / " + (kernel.workGroupNumCols * kernel.microTileNumCols) + "; // last column" + endLine;
      } else {
        kStr += "  uint groupCol = get_group_id(1);" + endLine;
      }

      ////////////////////////////////////////////////////////////////////////
      // z-order - TODO doesn't improve caching, only lowers occupancy
      if (false) {
        kStr += (
          "  // convert work-group order to z-order" + endLine +
          "  unsigned int morton = get_group_id(1) * get_num_groups(0) + get_group_id(0);" + endLine +
          "  groupRow = morton;" + endLine +
          "  groupCol = ( groupRow >> 1 );" + endLine +
          "  groupRow &= 0x55555555;" + endLine +
          "  groupCol &= 0x55555555;" + endLine +
          "  groupRow |= ( groupRow >> 1 );" + endLine +
          "  groupCol |= ( groupCol >> 1 );" + endLine +
          "  groupRow &= 0x33333333;" + endLine +
          "  groupCol &= 0x33333333;" + endLine +
          "  groupRow |= ( groupRow >> 2 );" + endLine +
          "  groupCol |= ( groupCol >> 2 );" + endLine +
          "  groupRow &= 0x0f0f0f0f;" + endLine +
          "  groupCol &= 0x0f0f0f0f;" + endLine +
          "  groupRow |= ( groupRow >> 4 );" + endLine +
          "  groupCol |= ( groupCol >> 4 );" + endLine +
          "  groupRow &= 0x00ff00ff;" + endLine +
          "  groupCol &= 0x00ff00ff;" + endLine +
          "  groupRow |= ( groupRow >> 8 );" + endLine +
          "  groupCol |= ( groupCol >> 8 );" + endLine +
          "  groupRow &= 0x0000ffff;" + endLine +
          "  groupCol &= 0x0000ffff;" + endLine + endLine
          );
      }

      kStr += (
        "  uint localRow = get_local_id(0);" + endLine +
        "  uint localCol = get_local_id(1);" + endLine +
        "  uint localSerial = localRow + localCol*WG_NUM_ROWS;" + endLine);

      ////////////////////////////////////////////////////////////////////////
      // global indices being loaded
      kStr += endLine;
      kStr += "  /* global indices being loaded */" + endLine;
      if ((kernel.order == "clblasColumnMajor") == (kernel.transA == "N")) {
        kStr += (
          "#define globalARow(LID) (groupRow*MACRO_TILE_NUM_ROWS + (localSerial+(LID)*WG_NUM_ROWS*WG_NUM_COLS)%MACRO_TILE_NUM_ROWS)" + endLine +
          "#define globalACol(LID) ((localSerial+(LID)*WG_NUM_ROWS*WG_NUM_COLS)/MACRO_TILE_NUM_ROWS)" + endLine);
      } else {
        kStr += (
          "#define globalARow(LID) (groupRow*MACRO_TILE_NUM_ROWS + (localSerial+(LID)*WG_NUM_ROWS*WG_NUM_COLS)/NUM_UNROLL_ITER)" + endLine +
          "#define globalACol(LID) ((localSerial+(LID)*WG_NUM_ROWS*WG_NUM_COLS)%NUM_UNROLL_ITER)" + endLine);
      }
      if ((kernel.order == "clblasColumnMajor") == (kernel.transB == "N")) {
        kStr += (
          "#define globalBRow(LID) ((localSerial+(LID)*WG_NUM_ROWS*WG_NUM_COLS)%NUM_UNROLL_ITER)" + endLine +
          "#define globalBCol(LID) (groupCol*MACRO_TILE_NUM_COLS + (localSerial+(LID)*WG_NUM_ROWS*WG_NUM_COLS)/NUM_UNROLL_ITER)" + endLine);
      } else {
        kStr += (
          "#define globalBRow(LID) ((localSerial+(LID)*WG_NUM_ROWS*WG_NUM_COLS)/MACRO_TILE_NUM_COLS)" + endLine +
          "#define globalBCol(LID) (groupCol*MACRO_TILE_NUM_COLS + (localSerial+(LID)*WG_NUM_ROWS*WG_NUM_COLS)%MACRO_TILE_NUM_COLS)" + endLine);
      }
  
      //kStr += (
      //  "  A += GET_GLOBAL_INDEX_A( globalARow, globalACol );" + endLine +
      //  "  B += GET_GLOBAL_INDEX_B( globalBRow, globalBCol );" + endLine )

      ////////////////////////////////////////////////////////////////////////
      // loop over k
      kStr += endLine;
      kStr += (
        "  /* loop over k */" + endLine +
        "  uint block_k = K / NUM_UNROLL_ITER;" + endLine +
        "  do {" + endLine);

      ////////////////////////////////////////////////////////////////////////
      // local indices being written
      kStr += endLine;
      kStr += "    /* local indices being written */" + endLine;
      if ((kernel.order == "clblasColumnMajor") == (kernel.transA == "N")) {
        kStr += (
          "#define localARow (localSerial % MACRO_TILE_NUM_ROWS)" + endLine +
          "#define localACol (localSerial / MACRO_TILE_NUM_ROWS)" + endLine +
          "#define localAStride (WG_NUM_ROWS*WG_NUM_COLS)" + endLine);
      } else {
        kStr += (
          "#define localARow (localSerial / NUM_UNROLL_ITER)" + endLine +
          "#define localACol (localSerial % NUM_UNROLL_ITER)" + endLine +
          "#define localAStride (WG_NUM_ROWS*WG_NUM_COLS/NUM_UNROLL_ITER)" + endLine);
      }

      if ((kernel.order == "clblasColumnMajor") == (kernel.transB == "N")) {
        kStr += (
          "#define localBRow ( localSerial % NUM_UNROLL_ITER )" + endLine +
          "#define localBCol ( localSerial / NUM_UNROLL_ITER )" + endLine +
          "#define localBStride (WG_NUM_ROWS*WG_NUM_COLS/NUM_UNROLL_ITER)" + endLine);
      } else {
        kStr += (
          "#define localBRow ( localSerial / MACRO_TILE_NUM_COLS )" + endLine +
          "#define localBCol ( localSerial % MACRO_TILE_NUM_COLS )" + endLine +
          "#define localBStride  (WG_NUM_ROWS*WG_NUM_COLS)" + endLine);
      }


      kStr += (
        "    __local DATA_TYPE_STR *lA = localA + GET_LOCAL_INDEX_A(localARow, localACol);" + endLine +
        "    __local DATA_TYPE_STR *lB = localB + GET_LOCAL_INDEX_B(localBRow, localBCol);" + endLine +
        "    barrier(CLK_LOCAL_MEM_FENCE);" + endLine);

      ////////////////////////////////////////////////////////////////////////
      // load global -> local
      // threads to do loading = (workGroupNumRows*workGroupNumCols)
      // A elements to be loaded = workGroupNumRows*microTileNumRows*unroll
      // B elements to be loaded = workGroupNumCols*microTileNumCols*unroll
      kStr += endLine;
      kStr += "    /* load global -> local */" + endLine;
      var numALoads = Math.floor((kernel.workGroupNumRows * kernel.microTileNumRows * kernel.unroll) / (kernel.workGroupNumRows * kernel.workGroupNumCols));
      var numALoadsR = (kernel.workGroupNumRows * kernel.microTileNumRows * kernel.unroll) % (kernel.workGroupNumRows * kernel.workGroupNumCols);
      var numBLoads = Math.floor((kernel.workGroupNumCols * kernel.microTileNumCols * kernel.unroll) / (kernel.workGroupNumRows * kernel.workGroupNumCols));
      var numBLoadsR = (kernel.workGroupNumCols * kernel.microTileNumCols * kernel.unroll) % (kernel.workGroupNumRows * kernel.workGroupNumCols);

      // TODO - zeroString for real and complex
      var zeroString;
      if (kernel.precision == "c") {
        zeroString = "(float2)(0.f, 0.f)";
      } else if (kernel.precision == "z") {
        zeroString = "(double2)(0.0, 0.0)";
      } else {
        zeroString = "0.0";
      }
      for (var a = 0; a < numALoads; a++) {
        kStr += "    lA[ " + a + "*localAStride ] = ";
        if (kernel.isRowKernel()) {
          kStr += "( globalARow(" + a + ") >= M) ? " + zeroString + " : ";
        }
        kStr += "A[ GET_GLOBAL_INDEX_A( globalARow(" + a + "), globalACol(" + a + ") ) ];" + endLine;
      }
      if (numALoadsR > 0) {
        kStr += "    if ( localSerial + " + (numALoads) + "*WG_NUM_ROWS*WG_NUM_COLS < (WG_NUM_ROWS*MICRO_TILE_NUM_ROWS*NUM_UNROLL_ITER) ) {" + endLine;
        kStr += "      lA[ " + numALoads + "*localAStride ] = ";
        if (kernel.isRowKernel()) {
          kStr += "( globalARow(" + numALoads + ") >= M) ? " + zeroString + " : ";
        }
        kStr += "A[ GET_GLOBAL_INDEX_A( globalARow(" + numALoads + "), globalACol(" + numALoads + ") ) ];" + endLine;
        kStr += "    }" + endLine;
      }

      for (var b = 0; b < numBLoads; b++) {
        kStr += "    lB[ " + b + "*localBStride ] = ";
        if (kernel.isColKernel()) {
          kStr += "( globalBCol(" + b + ") >= N) ? " + zeroString + " : ";
        }
        kStr += "B[ GET_GLOBAL_INDEX_B( globalBRow(" + b + "), globalBCol(" + b + ") ) ];" + endLine;

      }
      if (numBLoadsR > 0) {
        kStr += "    if ( localSerial + " + (numBLoads) + "*WG_NUM_ROWS*WG_NUM_COLS < (WG_NUM_COLS*MICRO_TILE_NUM_COLS*NUM_UNROLL_ITER) ) {" + endLine;
        kStr += "      lB[ " + numBLoads + "*localBStride ] = ";
        if (kernel.isColKernel()) {
          kStr += "(globalBCol(" + numBLoads + ") >= N) ? " + zeroString + " : ";
        }
        kStr += "B[ GET_GLOBAL_INDEX_B( globalBRow(" + numBLoads + "), globalBCol(" + numBLoads + ") ) ];" + endLine;
        kStr += "    }" + endLine;
      }
      kStr += (
        "    barrier(CLK_LOCAL_MEM_FENCE);" + endLine +
        "    uint offA = localRow;" + endLine +
        "    uint offB = localCol;" + endLine);

      ////////////////////////////////////////////////////////////////////////
      // do mads
      kStr += endLine;
      kStr += "    /* do mads */" + endLine;
      for (var u = 0; u < kernel.unroll; u++) {
        kStr += "    MICRO_TILE" + endLine;
      }

      ////////////////////////////////////////////////////////////////////////
      // shift to next k block
      kStr += endLine;
      kStr += "    /* shift to next k block */" + endLine;
      if ((kernel.order == "clblasColumnMajor") == (kernel.transA == "N")) {
        kStr += "    A += lda*NUM_UNROLL_ITER;" + endLine;
      } else {
        kStr += "    A += NUM_UNROLL_ITER;" + endLine;
      }
      if ((kernel.order == "clblasColumnMajor") == (kernel.transB == "N")) {
        kStr += "    B += NUM_UNROLL_ITER;" + endLine;
      } else {
        kStr += "    B += ldb*NUM_UNROLL_ITER;" + endLine;
      }

      ////////////////////////////////////////////////////////////////////////
      // end loop
      kStr += endLine;
      kStr += "  } while (--block_k > 0);" + endLine;
      kStr += endLine;

      ////////////////////////////////////////////////////////////////////////
      // which global Cij index
      kStr += endLine;
      kStr += "  /* which global Cij index */" + endLine;
      kStr += "  uint globalCRow = groupRow * MACRO_TILE_NUM_ROWS + localRow;" + endLine;
      kStr += "  uint globalCCol = groupCol * MACRO_TILE_NUM_COLS + localCol;" + endLine;

      ////////////////////////////////////////////////////////////////////////
      // write global Cij
      kStr += endLine;
      kStr += "  /* write global Cij */" + endLine;
      if (kernel.precision == "c") {
        kStr += "  float type_mad_tmp;" + endLine;
      }
      if (kernel.precision == "z") {
        kStr += "  double type_mad_tmp;" + endLine;
      }

      for (var a = 0; a < kernel.microTileNumRows; a++) {
        for (var b = 0; b < kernel.microTileNumCols; b++) {
          if (kernel.isRowKernel()) {
            kStr += "  if (globalCRow+" + a + "*WG_NUM_ROWS < M)";
          }
          if (kernel.isColKernel()) {
            kStr += "  if (globalCCol+" + b + "*WG_NUM_COLS < N)";
          }
          if (kernel.isRowKernel() || kernel.isColKernel()) {
            kStr += "{";
          }
          kStr += "  TYPE_MAD_WRITE( C[ GET_GLOBAL_INDEX_C( globalCRow+" + a + "*WG_NUM_ROWS, globalCCol+" + b + "*WG_NUM_COLS) ], alpha, rC[" + a + "][" + b + "], beta )";
          if (kernel.isRowKernel() || kernel.isColKernel()) {
            kStr += "}";
          }
          kStr += endLine;
        }
      }

      ////////////////////////////////////////////////////////////////////////
      // end kernel
      kStr += endLine;
      kStr += "}" + endLine;

      return kStr;
    }

    return function (name) {
      var kernel;
      if (!(name in kernels)) {
        var kp = new KernelParameters(name);
        var kernelstr = makeOpenCLKernelString(kp);
        //var compile_begin = new Date();
        kernel = $CL.createKernel(kernelstr);
        //var compile_end = new Date();
        //console.log('compiling ' + name + ': ' + (compile_end - compile_begin) + 'ms');
        kernels[name] = kernel;
      } else {
        kernel = kernels[name];
      }
      return kernel;
    }
  } ();

})();

},{"../../matrix":16,"../../sushi":21,"../../util":22,"../matrix_cl":11,"./driver":4,"./util_cl":10}],4:[function(require,module,exports){
'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.

(function () {
  var $CL;
  if (typeof window === 'undefined') {
    $CL = require('./driver_opencl.js');
  } else {
    $CL = require('./driver_webcl.js');
  }
  
  module.exports = $CL;
})();

},{"./driver_opencl.js":"/src/cl/handwrittenjs/driver_opencl.js","./driver_webcl.js":5}],5:[function(require,module,exports){
'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.

(function () {
  var $M = require('../../sushi');

  var $CL = {};
  var env = getEnvironment();
  $CL.WebCL = createWebCLObject();
  initWebCL($CL.WebCL);
  initUtilityMethods($CL.WebCL);

  function getEnvironment() {
    // check environment
    if (typeof window !== 'undefined' && window.webcl !== void 0) {
      var env = 'ff';
    } else if (typeof WebCL === 'function') {
      var env = 'chromium';
    } else {
      var env = void 0;
    }
    return env;
  }

  function createWebCLObject() {
    // create WebCL object
    var web_cl = void 0;
    switch (env) {
      case 'chromium':
        web_cl = new WebCL();
        break;
      case 'ff':
        web_cl = window.webcl;
        break;
    }
    return web_cl;
  }

  function initWebCL(WebCL) {
    // decide platform to use
    var platform_list = WebCL.getPlatforms();
    var platform_index = 0;
    //select by name
    var platform_priority = ['CUDA', 'AMD', 'Apple', 'OpenCL'];
    var priority = platform_priority.length + 1;
    var includeIndexOf = function (array, search) {
      for (var i = 0; i < array.length; i++) {
        if (search.indexOf(array[i]) !== -1) {
          return i;
        }
      }
      return array.length;
    };
    for (var i = 0; i < platform_list.length; i++) {
      var platform_tmp = platform_list[i];
      var platform_info_tmp = platform_tmp.getInfo(WebCL.PLATFORM_NAME);
      var priority_tmp = includeIndexOf(platform_priority, platform_info_tmp);
      if (priority_tmp < priority) {
        priority = priority_tmp;
        platform_index = i;
        $CL.platform = platform_tmp;
        $CL.platform_info = platform_info_tmp;
      }
    }
    $CL.platform = platform_list[platform_index];
    $CL.platform_info = $CL.platform.getInfo(WebCL.PLATFORM_NAME);

    try {
      var device_type = WebCL.DEVICE_TYPE_GPU;
      $CL.devices = $CL.platform.getDevices(device_type);//causes exception on firefox + Intel OpenCL
    } catch (ex) {
      $CL.devices = [];
    }
    if ($CL.devices.length === 0) {
      device_type = WebCL.DEVICE_TYPE_CPU;
      $CL.devices = $CL.platform.getDevices(device_type);;
    }

    // device selector (experimental)
    var device_index = 0;
    // selection by url (xxx?device_index=X)
    var url_vars = function () {
      var vars = {};
      var param = location.search.substring(1).split('&');
      for (var i = 0; i < param.length; i++) {
        var keySearch = param[i].search(/=/);
        var key = '';
        if (keySearch != -1) key = param[i].slice(0, keySearch);
        var val = param[i].slice(param[i].indexOf('=', 0) + 1);
        if (key != '') vars[key] = decodeURI(val);
      }
      return vars;
    } ();
    device_index =
      url_vars.device_index ?
        Math.min(url_vars.device_index, $CL.devices.length - 1) :
        0;
    $CL.selected_device = $CL.devices[device_index];
    $CL.device_info = $CL.selected_device.getInfo(WebCL.DEVICE_NAME);
    $CL.device_max_work_group_size = $CL.selected_device.getInfo(WebCL.DEVICE_MAX_WORK_GROUP_SIZE);

    // initialize methods dependent on implementation
    WebCL.type = {
      CHAR: 0,
      UCHAR: 1,
      SHORT: 2,
      USHORT: 3,
      INT: 4,
      UINT: 5,
      LONG: 6,
      ULONG: 7,
      FLOAT: 8,
      HALF: 9,
      DOUBLE: 10,
      QUAD: 11,
      LONG_LONG: 12,
      VEC2: 65536,
      VEC3: 131072,
      VEC4: 262144,
      VEC8: 524288,
      VEC16: 1048576,
      LOCAL_MEMORY_SIZE: 255
    };

    switch (env) {
      case 'ff':
        $CL.context = WebCL.createContext($CL.platform, device_type);
        var table_primitive = {};
        table_primitive[WebCL.type.CHAR] = Uint8Array;
        table_primitive[WebCL.type.UCHAR] = Int8Array;
        table_primitive[WebCL.type.SHORT] = Int16Array;
        table_primitive[WebCL.type.USHORT] = Uint16Array;
        table_primitive[WebCL.type.INT] = Int32Array;
        table_primitive[WebCL.type.UINT] = Uint32Array;
        table_primitive[WebCL.type.LONG] = Int32Array;//64bit variable is not supported
        table_primitive[WebCL.type.ULONG] = Uint32Array;
        table_primitive[WebCL.type.FLOAT] = Float32Array;
        table_primitive[WebCL.type.HALF] = Float32Array;//16bit float is not supported
        table_primitive[WebCL.type.DOUBLE] = Float64Array;
        table_primitive[WebCL.type.QUAD] = Float32Array;//not supported
        table_primitive[WebCL.type.LONG_LONG] = Float32Array;//not supported
        var table_vec_len = {};
        table_vec_len[0] = 1;
        table_vec_len[WebCL.type.VEC2] = 2;
        table_vec_len[WebCL.type.VEC3] = 3;
        table_vec_len[WebCL.type.VEC4] = 4;
        table_vec_len[WebCL.type.VEC8] = 8;
        table_vec_len[WebCL.type.VEC16] = 16;
        $CL.kernelSetArg = function (kernel, idx, param, type) {
          if (type !== void 0) {
            if (type == WebCL.type.LOCAL_MEMORY_SIZE) {
              param = new Uint32Array([param]);
            } else {
              var primitive = type & 0xFF;
              var array_ctor = table_primitive[primitive];
              var vec = type & 0x1F0000;
              var vec_len = table_vec_len[vec];
              if (vec_len > 1) {
                param = new array_ctor(param);//param is array
              } else {
                param = new array_ctor([param]);//param is scalar value
              }
            }
          }
          kernel.setArg(idx, param);
        };
        break;
      case 'chromium':
        //TODO
        var properties = new WebCLContextProperties();
        properties.platform = $CL.platform;
        properties.deviceType = device_type;
        properties.devices = $CL.devices;
        properties.shareGroup = 1;
        $CL.context = WebCL.createContext(properties);
        $CL.kernelSetArg = function (kernel, idx, param, type) {
          if (type !== void 0) {
            switch (type) {
              case WebCL.type.UINT:
                var type_tmp = WebCL.KERNEL_ARG_UINT;
                break;
              case WebCL.type.INT:
                var type_tmp = WebCL.KERNEL_ARG_INT;
                break;
              case WebCL.type.FLOAT:
                var type_tmp = WebCL.KERNEL_ARG_FLOAT;
                break;
            }
            kernel.setKernelArg(idx, param, type_tmp);
          } else {
            kernel.setKernelArgGlobal(idx, param);
          }
        };
        break;
    }

    switch (env) {
      case 'ff':
        $CL.queue =
          $CL.context.createCommandQueue($CL.selected_device, 0);
        break;
      case 'chromium':
        $CL.queue =
          $CL.context.createCommandQueue($CL.devices, null);
        break;
    }

    $CL.buffers = 0;//number of existing buffers on device
  }


  function initUtilityMethods(WebCL) {
    $CL.createKernel = function (code, name) {
      if (!name) {
        name = 'kernel_func';
      }
      var program = $CL.context.createProgram(code);
      switch (env) {
        case 'ff':
          program.build($CL.devices);
          break;
        case 'chromium':
          program.buildProgram(null, null, null);
          break;
      }
      return program.createKernel(name);
    };

    $CL.createBuffer = function (byte_length) {
      var buffer = $CL.context.createBuffer(WebCL.MEM_READ_WRITE, byte_length);
      $CL.buffers++;
      return buffer;
    };

    $CL.writeBuffer = function (buffer, typed_array, offset) {
      if (offset === void 0) { offset = 0; }
      if (typed_array.byteOffset === 0) {
        $CL.queue.enqueueWriteBuffer(buffer,
          true,//blocking write
          offset,
          typed_array.byteLength,
          typed_array);
      } else {
        //workaround for firefox
        var tmpbuf = new typed_array.constructor(typed_array);
        $CL.queue.enqueueWriteBuffer(buffer,
          true,//blocking write
          offset,
          tmpbuf.byteLength,
          tmpbuf);
      }
    };

    $CL.executeKernel = function (kernel, params, parallelization, localWS) {
      for (var i = 0; i < params.length; i++) {
        if (params[i].type === void 0) {
          // Matrix class
          $CL.kernelSetArg(kernel, i, params[i].datum._clbuffer);
        } else {
          // native type
          $CL.kernelSetArg(kernel, i, params[i].datum, params[i].type);
        }
      }

      // scalar to array
      if (parallelization != null && parallelization.length === void 0) {
        parallelization = [parallelization];
      }
      if (localWS != null && localWS.length === void 0) {
        localWS = [localWS];
      }

      var globalWS;
      if (localWS == null) {
        //n-d parallelization
        var localWS_each = [64, 64, 8, 4][parallelization.length];
        localWS = [];
        globalWS = [];
        for (var i = 0; i < parallelization.length; i++) {
          localWS.push(localWS_each);
          globalWS.push(Math.ceil(parallelization[i] / localWS_each) * localWS_each);
        }
      } else {
        globalWS = [];
        for (var i = 0; i < parallelization.length; i++) {
          globalWS.push(Math.ceil(parallelization[i] / localWS[i]) * localWS[i]);
        }
      }
      // Execute kernel
      switch (env) {
        case 'ff':
          $CL.queue.enqueueNDRangeKernel(kernel,
            globalWS.length,
            null,
            globalWS,
            localWS);
          break;
        case 'chromium':
          globalWS = new Int32Array(globalWS);
          $CL.queue.enqueueNDRangeKernel(kernel,
            null,
            globalWS,
            localWS);
          $CL.queue.finish();
          break;
      }
      $CL.queue.flush();
    };

    $CL.flush = function () {
      $CL.queue.flush();
    };

    $CL.finish = function () {
      $CL.queue.finish();
    };

    $CL.readBuffer = function (buffer, typed_array, offset) {
      if (offset === void 0) { offset = 0; }
      if (typed_array.byteOffset === 0) {
        $CL.queue.enqueueReadBuffer(buffer,
          true,//blocks until the reading completes
          offset,
          typed_array.byteLength,
          typed_array);
      } else {
        //workaround of bug in firefox webcl that byteOffset is ignored
        var tmpbuf = new typed_array.constructor(typed_array.length);
        $CL.queue.enqueueReadBuffer(buffer,
          true,//blocks until the reading completes
          offset,
          tmpbuf.byteLength,
          tmpbuf);
        typed_array.set(tmpbuf);
      }
    }

    switch (env) {
      case 'ff':
        $CL.releaseBuffer = function (buffer) {
          buffer.release();
          $CL.buffers--;
        };
        break;
      case 'chromium':
        $CL.releaseBuffer = function (buffer) {
          buffer.releaseCL();
          $CL.buffers--;
        };
        break;
    }
  }

  module.exports = $CL;
})();

},{"../../sushi":21}],6:[function(require,module,exports){
'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
// overwrites reduction functions

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

  var maxmin_reduction_along_axis_cl = function (A, dim, name, is_min, is_argmax) {
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
      if (is_argmax) {
        var amat = new MatrixCL(A._size, 'int32');
        amat._fill(1);
        return { M: A.copy(), I: amat };
      } else {
        return A.copy();
      }
    }

    var dstsize = A._size.slice();
    if (dstsize[dim - 1] !== 0) {
      //size 0 dimension is preserved
      dstsize[dim - 1] = 1;
    }

    if ((A._numel === 0) || (A._size[dim - 1] === 1)) {
      //only change shape
      var dst_onlyreshape = A.copy();
      dst_onlyreshape.reshape_inplace(dstsize);
      if (is_argmax) {
        var amat = new MatrixCL(dstsize, 'int32');
        amat._fill(1);
        return { M: dst_onlyreshape, I: amat };
      } else {
        return dst_onlyreshape;
      }
    }

    //reduction actually needed
    var dst = new MatrixCL(dstsize, A._klass);
    var argmax = null;
    if (is_argmax) {
      argmax = new MatrixCL(dstsize, 'int32');
    }
    var input_strides = A._strides;
    var output_strides = dst._strides.slice();
    while (output_strides.length <= input_strides.length) {
      output_strides.push(dst._numel);
    }
    var output_strides_mat = MatrixCL._fromtypedarray(new Int32Array(output_strides), 'int32');
    var input_strides_mat = MatrixCL._fromtypedarray(new Int32Array(A._strides), 'int32');

    var reduction_step = input_strides[dim - 1];
    var reduction_count = A._size[dim - 1];
    var dims = A._ndims;

    var kernel_name = 'maxmin_reduction_cl_' + name + '_' + (A._klass) + '_' + dims;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_DST_TYPE ' + ctypes[A._klass],
        '#define DIMS ' + dims,
        '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global SRC_DST_TYPE *src,',
        is_argmax ? '__global int *argmax,' : '',
        ' uint length,',
        '__global int *output_strides, __global int *input_strides, int reduction_step, int reduction_count) {',
        '  int i = (int)get_global_id(0);',
        '  if (i >= length) { return; }',
        '  int src_idx = 0;',
        '  for (int d = 0; d < DIMS; d++) {',
        '    src_idx += i % output_strides[d+1] / output_strides[d] * input_strides[d];',
        '  }',
        '  SRC_DST_TYPE val = src[src_idx];',
        '  SRC_DST_TYPE accum = val;',
        is_argmax ? '  int accumarg = 0;' : '',
        '  for (int red = 1; red < reduction_count; red++) {',
        '    src_idx += reduction_step;',
        '    val = src[src_idx];',
        is_min ? (is_argmax ? 'if (val < accum) { accum = val; accumarg = red; }' : 'if (val < accum) { accum = val; }')
          : (is_argmax ? 'if (val > accum) { accum = val; accumarg = red; }' : 'if (val > accum) { accum = val; }'),//'    if (val > accum) { accum = val; }'
        '  }',
        '  dst[i] = accum;',
        is_argmax ? 'argmax[i] = accumarg + 1;' : '',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (dst._numel > 0) {
      if (is_argmax) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: dst },
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { access: WebCL.MEM_WRITE_ONLY, datum: argmax },
          { datum: dst._numel, type: WebCL.type.INT },
          { access: WebCL.MEM_READ_ONLY, datum: output_strides_mat },
          { access: WebCL.MEM_READ_ONLY, datum: input_strides_mat },
          { datum: reduction_step, type: WebCL.type.INT },
          { datum: reduction_count, type: WebCL.type.INT }
        ], dst._numel);

      } else {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: dst },
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { datum: dst._numel, type: WebCL.type.INT },
          { access: WebCL.MEM_READ_ONLY, datum: output_strides_mat },
          { access: WebCL.MEM_READ_ONLY, datum: input_strides_mat },
          { datum: reduction_step, type: WebCL.type.INT },
          { datum: reduction_count, type: WebCL.type.INT }
        ], dst._numel);
      }
    }

    if (is_argmax) {
      return { M: dst, I: argmax };
    } else {
      return dst;
    }
  };

  var stat_reduction_along_axis_cl = function (A, dim, name, init_accum, update_accum, assign_result) {
    // for statistics methods, output is single klass
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

    var virtual_input_shape = A._size.concat();
    while (dim > virtual_input_shape.length) {
      // A._size = [10, 20], dim = 4 => virtual_input_shape = [10, 20, 1, 1]
      virtual_input_shape.push(1);
    }
    var dstsize = virtual_input_shape.concat();
    if (dstsize[dim - 1] !== 0) {
      //size 0 dimension is preserved
      dstsize[dim - 1] = 1;
    }

    //reduction actually needed
    var dst = new MatrixCL(dstsize, 'single');
    if (A._numel == 0) {
      return dst;//empty
    }
    var dims = virtual_input_shape.length;
    var input_strides = [];
    var tmp = 1;
    for (var i = 0; i < dims; i++) {
      input_strides.push(tmp);
      tmp *= virtual_input_shape[i];
    }
    var output_strides = [];
    tmp = 1;
    for (var i = 0; i < dims; i++) {
      output_strides.push(tmp);
      tmp *= dstsize[i];
    }
    output_strides.push(tmp);//excess 1 dimension required

    var output_strides_mat = MatrixCL._fromtypedarray(new Int32Array(output_strides), 'int32');
    var input_strides_mat = MatrixCL._fromtypedarray(new Int32Array(input_strides), 'int32');

    var reduction_step = input_strides[dim - 1];
    var reduction_count = virtual_input_shape[dim - 1];

    var kernel_name = 'stat_reduction_cl_' + name + '_' + (A._klass) + '_' + dims;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_TYPE ' + ctypes[A._klass],
        '#define DST_TYPE float',
        '#define DIMS ' + dims,
        '__kernel void kernel_func(__global DST_TYPE *dst, __global const SRC_TYPE *src,',
        ' uint length,',
        '__global const int *output_strides, __global const int *input_strides, int reduction_step, int reduction_count) {',
        '  int i = (int)get_global_id(0);',
        '  if (i >= length) { return; }',
        '  int src_idx = 0;',
        '  for (int d = 0; d < DIMS; d++) {',
        '    src_idx += i % output_strides[d+1] / output_strides[d] * input_strides[d];',
        '  }',
        '  DST_TYPE val = src[src_idx];',
        init_accum,//'  DST_TYPE accum = val;',
        '  for (int red = 1; red < reduction_count; red++) {',
        '    src_idx += reduction_step;',
        '    val = (DST_TYPE)src[src_idx];',
        update_accum,
        '  }',
        assign_result,//'  dst[i] = accum;',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    $CL.executeKernel(kernel, [
      { access: WebCL.MEM_WRITE_ONLY, datum: dst },
      { access: WebCL.MEM_READ_ONLY, datum: A },
      { datum: dst._numel, type: WebCL.type.INT },
      { access: WebCL.MEM_READ_ONLY, datum: output_strides_mat },
      { access: WebCL.MEM_READ_ONLY, datum: input_strides_mat },
      { datum: reduction_step, type: WebCL.type.INT },
      { datum: reduction_count, type: WebCL.type.INT }
    ], dst._numel);

    output_strides_mat.destruct();
    input_strides_mat.destruct();

    return dst;
  };

  var max_native = $M.max;
  $M.max = function (A, B, dim) {
    return $M.autodestruct(function () {
      var mats = util_cl.unify_mats([A, B]);
      if (mats.cl) {
        if (B == null) {
          return maxmin_reduction_along_axis_cl(A, dim, 'max', false, false);
        } else {
          return $M.CL._max_elementwise_cl(mats[0], mats[1]);
        }
      } else {
        return max_native(mats[0], mats[1], dim);
      }
    });
  };

  var min_native = $M.min;
  $M.min = function (A, B, dim) {
    return $M.autodestruct(function () {
      var mats = util_cl.unify_mats([A, B]);
      if (mats.cl) {
        if (B == null) {
          return maxmin_reduction_along_axis_cl(A, dim, 'min', true, false);
        } else {
          return $M.CL._min_elementwise_cl(mats[0], mats[1]);
        }
      } else {
        return min_native(mats[0], mats[1], dim);
      }
    });
  };

  var argmax_native = $M.argmax;
  $M.argmax = function (A, dummy, dim) {
    if (A instanceof MatrixCL) {
      return maxmin_reduction_along_axis_cl(A, dim, 'argmax', false, true);
    } else {
      return argmax_native(A, dummy, dim);
    }
  };
  var argmin_native = $M.argmin;
  $M.argmin = function (A, dummy, dim) {
    if (A instanceof MatrixCL) {
      return maxmin_reduction_along_axis_cl(A, dim, 'argmin', true, true);
    } else {
      return argmin_native(A, dummy, dim);
    }
  };

  var replace_sum = function (f_native, name, init_accum, update_accum, assign_result) {
    return function (A) {//(A: Matrix, dim: number, outtype?: string)
      if (A instanceof MatrixCL) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
          args[_i] = arguments[_i];
        }
        var dim = undefined;
        var outtype = undefined;
        for (var i = 1; i < arguments.length; i++) {
          var arg = arguments[i];
          if (typeof (arg) === 'string') {
            if (arg != 'native') {
              throw new Error('Outtype other than native is currently not supported');
            }
          } else if (typeof (arg) === 'number') {
            dim = arg;
          } else {
            throw new Error('Unknown argument ' + arg);
          }
        }
        return stat_reduction_along_axis_cl(A, dim, name,
          init_accum, update_accum, assign_result);
      } else {
        //use native
        return f_native.apply(null, arguments);
      }
    };
  }

  $M.sum = replace_sum($M.sum, 'sum', 'DST_TYPE accum = val;', 'accum += val;', 'dst[i] = accum;');
  $M.mean = replace_sum($M.mean, 'mean', 'DST_TYPE accum = val;', 'accum += val;', 'dst[i] = accum / reduction_count;');
  $M.prod = replace_sum($M.prod, 'prod', 'DST_TYPE accum = val;', 'accum *= val;', 'dst[i] = accum;');

  var replace_variance = function (f_native, name, do_sqrt) {
    return function (A, w, dim) {//(A: Matrix, w: number = 0, dim?: number)
      if (A instanceof MatrixCL) {
        var assign_result;
        if (w == null || w == 0) {
          assign_result = 'dst[i] = ' + do_sqrt + '((sqsum - normalsum * normalsum / reduction_count) / (reduction_count > 1 ? reduction_count - 1 : 1));';
        } else if (w == 1) {
          assign_result = 'dst[i] = ' + do_sqrt + '((sqsum - normalsum * normalsum / reduction_count) / reduction_count);';
        } else {
          throw new Error('w must be 0 or 1');
        }
        return stat_reduction_along_axis_cl(A, dim, name + w,
          'DST_TYPE normalsum = (DST_TYPE)val; DST_TYPE sqsum = (DST_TYPE)val * (DST_TYPE)val;', 'normalsum += val; sqsum += (DST_TYPE)val * (DST_TYPE)val;', assign_result);
      } else {
        //use native
        return f_native.apply(null, arguments);
      }
    };
  }

  $M.variance = replace_variance($M.variance, 'variance', '');
  $M.std = replace_variance($M.std, 'std', 'sqrt');
})();

},{"../../matrix":16,"../../sushi":21,"../../util":22,"../matrix_cl":11,"./driver":4,"./util_cl":10}],7:[function(require,module,exports){
'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
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

    
    if (dst_cols % 64 == 0 && dst_rows % 64 == 0) {
      var kernel_name = 'transpose_cl_' + A._klass + '_64';
      var kernel = MatrixCL.kernel_cache[kernel_name];
      var tile_size = 64;
      var block_size = 16;
      if (!kernel) {
        kernel = $CL.createKernel([
          '#define SRC_DST_TYPE ' + ctypes[A._klass],
          '#define TILE_SIZE ' + tile_size,
          '#define BLOCK_SIZE ' + block_size,
          '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global SRC_DST_TYPE *src,',
          'uint dst_rows, uint dst_cols)',
          '{',
          'uint r0 = get_group_id(0);',
          'uint r1 = get_group_id(1);',
          //'uint l0 = get_local_id(0);',
          'uint l1 = get_local_id(1);',
          '__local SRC_DST_TYPE block_cache[BLOCK_SIZE][BLOCK_SIZE];',
          'for (int tile_x = 0; tile_x < (TILE_SIZE / BLOCK_SIZE); tile_x++) {',
          'for (int tile_y = 0; tile_y < (TILE_SIZE / BLOCK_SIZE); tile_y++) {',
          'for (int i = 0; i < BLOCK_SIZE; i++) {',
          'block_cache[l1][i] = src[(r0 * TILE_SIZE + tile_x * BLOCK_SIZE + l1)+(r1 * TILE_SIZE + tile_y * BLOCK_SIZE + i)*dst_cols];',
          '}',
          'barrier(CLK_LOCAL_MEM_FENCE);',
          'for (int i = 0; i < BLOCK_SIZE; i++) {',
          'dst[(r1 * TILE_SIZE + tile_y * BLOCK_SIZE + l1) + (r0 * TILE_SIZE + tile_x * BLOCK_SIZE + i) * dst_rows] = block_cache[i][l1];',
          '}',
          'barrier(CLK_LOCAL_MEM_FENCE);',
          '}',
          '}',
          '}'
        ].join('\n'));
        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      if (dst._numel > 0) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: dst },
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { datum: dst_rows, type: WebCL.type.UINT },
          { datum: dst_cols, type: WebCL.type.UINT }
        ], [dst_cols / tile_size, dst_rows / (tile_size / block_size)], [1, block_size]);
      }
    } else if (dst_cols % 16 == 0 && dst_rows % 16 == 0) {
      var kernel_name = 'transpose_cl_' + A._klass + '_16';
      var kernel = MatrixCL.kernel_cache[kernel_name];
      var block_size = 16;
      if (!kernel) {
        kernel = $CL.createKernel([
          '#define SRC_DST_TYPE ' + ctypes[A._klass],
          '#define BLOCK_SIZE ' + block_size,
          '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global SRC_DST_TYPE *src,',
          'uint dst_rows, uint dst_cols)',
          '{',
          'uint r0 = get_group_id(0);',
          'uint r1 = get_group_id(1);',
          //'uint l0 = get_local_id(0);',
          'uint l1 = get_local_id(1);',
          '__local SRC_DST_TYPE block_cache[BLOCK_SIZE][BLOCK_SIZE];',
          'for (int i = 0; i < BLOCK_SIZE; i++) {',
          'block_cache[l1][i] = src[(r0 * BLOCK_SIZE + l1)+(r1 * BLOCK_SIZE + i)*dst_cols];',
          '}',
          'barrier(CLK_LOCAL_MEM_FENCE);',
          'for (int i = 0; i < BLOCK_SIZE; i++) {',
          'dst[(r1 * BLOCK_SIZE + l1) + (r0 * BLOCK_SIZE + i) * dst_rows] = block_cache[i][l1];',
          '}',
          '}'
        ].join('\n'));
        MatrixCL.kernel_cache[kernel_name] = kernel;
      }

      if (dst._numel > 0) {
        $CL.executeKernel(kernel, [
          { access: WebCL.MEM_WRITE_ONLY, datum: dst },
          { access: WebCL.MEM_READ_ONLY, datum: A },
          { datum: dst_rows, type: WebCL.type.UINT },
          { datum: dst_cols, type: WebCL.type.UINT }
        ], [dst_cols / block_size, dst_rows], [1, block_size]);
      }
    } else {
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
    var input_strides = new Int32Array(newdims + 1);
    var output_strides = new Int32Array(newdims + 1);
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

  var permute_native = $M.permute;
  var permute_cl = function (A, order) {
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
    var dst_size = [];
    for (var d = 0; d < ndim; d++) {
      var element = order[d] - 1;//order start from 1
      dst_size.push(src_size[element]);
    }

    var dst = new MatrixCL(dst_size, A._klass);
    var dst_strides = dst._strides.concat();
    while (dst_strides.length < ndim) {
      // occur when last dimensions are 1
      dst_strides.push(numel);
    }
    var dst_strides_perm = [];
    order.forEach((o, i) => dst_strides_perm[o - 1] = dst_strides[i]);
    var perm_stride = MatrixCL._fromtypedarray(new Int32Array(src_strides.concat(src_size, dst_strides_perm)), 'int32');

    var kernel_name = 'permute_cl_' + A._klass + '_' + ndim;
    var kernel = MatrixCL.kernel_cache[kernel_name];
    if (!kernel) {
      kernel = $CL.createKernel([
        '#define SRC_DST_TYPE ' + ctypes[A._klass],
        '#define DIMS ' + ndim,
        '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global const SRC_DST_TYPE *src,',
        '__global const int *perm_stride, uint length)',
        '{',
        'uint i = get_global_id(0);',
        'if (i >= length) {return;}',
        '__global int *src_strides = perm_stride;',
        '__global int *src_size = perm_stride + DIMS;',
        '__global int *dst_strides_perm = perm_stride + DIMS * 2;',
        'uint dst_idx = 0;',
        'for (int dim = 0; dim < DIMS; dim++) {',
        '  dst_idx += i / src_strides[dim] % src_size[dim] * dst_strides_perm[dim];',
        '}',
        'dst[dst_idx] = src[i];',
        '}'
      ].join('\n'));
      MatrixCL.kernel_cache[kernel_name] = kernel;
    }

    if (dst._numel > 0) {
      $CL.executeKernel(kernel, [
        { access: WebCL.MEM_WRITE_ONLY, datum: dst },
        { access: WebCL.MEM_READ_ONLY, datum: A },
        { access: WebCL.MEM_READ_ONLY, datum: perm_stride },
        { datum: dst._numel, type: WebCL.type.UINT }
      ], dst._numel, 256);
    }

    perm_stride.destruct();

    return dst;
  };

  $M.permute = function (A, order) {
    if (A instanceof MatrixCL) {
      return permute_cl(A, order);
    } else {
      return permute_native(A, order);
    }
  };

  var ipermute_native = $M.ipermute;
  $M.ipermute = function (A, order) {
    if (A instanceof MatrixCL) {
      // reverse order
      var rev_order = order.concat();//have same elements
      for (var d = 0; d < order.length; d++) {
        rev_order[order[d] - 1] = d + 1;
      }
      return permute_cl(A, rev_order);
    } else {
      return ipermute_native(A, order);
    }
  };
})();

},{"../../matrix":16,"../../sushi":21,"../../util":22,"../matrix_cl":11,"./driver":4,"./util_cl":10}],8:[function(require,module,exports){
'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
// overwrites functions in $M by opencl-aware version

var $M = require('../../sushi');
var util = require('../../util');
module.exports = $M;

(function () {
  if ($M.CL) {
    return;
  }
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../../matrix');
  var MatrixCL = require('../matrix_cl');
  $M.CL.MatrixCL = MatrixCL;
  var WebCL = $M.CL.WebCL;

  $M.gpuArray = function (A) {
    if (A instanceof MatrixCL) {
      return A.copy();
    }
    A = util.as_mat(A);
    var mat = new MatrixCL(A._size, A._klass);
    mat.write(A._data);
    return mat;
  };

  $M.gather = function (A) {
    if (!(A instanceof MatrixCL)) {
      return A.copy();
    }
    var mat = new Matrix(A._size, A._klass);
    A.read(mat._data);
    return mat;
  };

  $M.devicetype = function (A) {
    if (A instanceof MatrixCL) {
      return 'cl';
    } else if (A instanceof Matrix) {
      return 'cpu';
    }
    return null;
  }

  var zeros_native = $M.zeros;
  $M.zeros = function () {
    //generate gpuArray if final argument is 'gpuArray'
    if (arguments[arguments.length - 1] == 'gpuArray') {
      var format = util.calc_zeros_size(Array.prototype.slice.call(arguments, 0, -1));
      var mat = new MatrixCL(format.size, format.klass);
      mat._fill(0);
      return mat;
    } else {
      return zeros_native.apply(null, arguments);
    }
  };
  var ones_native = $M.ones;
  $M.ones = function () {
    //generate gpuArray if final argument is 'gpuArray'
    if (arguments[arguments.length - 1] == 'gpuArray') {
      var format = util.calc_zeros_size(Array.prototype.slice.call(arguments, 0, -1));
      var mat = new MatrixCL(format.size, format.klass);
      mat._fill(1);
      return mat;
    } else {
      return ones_native.apply(null, arguments);
    }
  };

  require('./binary_arithmetic');
  require('./unary_arithmetic');
  require('./shape_converter_cl');
  require('./reduction_cl');
  require('./clblasgemm');
})();

},{"../../matrix":16,"../../sushi":21,"../../util":22,"../matrix_cl":11,"./binary_arithmetic":2,"./clblasgemm":3,"./driver":4,"./reduction_cl":6,"./shape_converter_cl":7,"./unary_arithmetic":9}],9:[function(require,module,exports){
'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
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

},{"../../matrix":16,"../../sushi":21,"../../util":22,"../matrix_cl":11,"./driver":4,"./util_cl":10}],10:[function(require,module,exports){
'use strict';
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.

var $M = require('../../sushi');

(function () {
  var $CL = require('./driver');
  $M.CL = $CL;

  var Matrix = require('../../matrix');
  var MatrixCL = require('../matrix_cl');
  var WebCL = $M.CL.WebCL;
  var ctypes = { single: 'float', int32: 'int', uint8: 'uchar', logical: 'uchar' };
  module.exports.ctypes = ctypes;
  var webcltypes = { single: WebCL.type.FLOAT, int32: WebCL.type.INT, uint8: WebCL.type.UCHAR, logical: WebCL.type.UCHAR };
  module.exports.webcltypes = webcltypes;
  
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
  
  module.exports.unify_mats = unify_mats;

  var unify_call = function (native_func, cl_func) {
    //call function using specified arguments unified
    var unified_mats = unify_mats(Array.prototype.slice.call(arguments, 2));
    if (unified_mats.cl) {
      return cl_func.apply(null, unified_mats);
    } else {
      return native_func.apply(null, unified_mats);
    }
  }

  module.exports.unify_call = unify_call;
})();

},{"../../matrix":16,"../../sushi":21,"../matrix_cl":11,"./driver":4}],11:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Matrix = require('../matrix');
var Colon = require('../colon');
var $CL = require('./handwrittenjs/driver');
var WebCL = $CL.WebCL;
var ctypes = { single: 'float', int32: 'int', uint8: 'uchar', logical: 'uchar' };
var webcltypes = { single: WebCL.type.FLOAT, int32: WebCL.type.INT, uint8: WebCL.type.UCHAR, logical: WebCL.type.UCHAR };
var MatrixCL = (function (_super) {
    __extends(MatrixCL, _super);
    function MatrixCL(size, klass) {
        _super.call(this, size, klass, true);
        var buffer_size = this._numel * this._data_ctor.BYTES_PER_ELEMENT;
        if (this._numel == 0) {
            // buffer of 0 byte cannot be constructed, but allocate buffer to avoid exception
            buffer_size = 4;
        }
        this._clbuffer = $CL.createBuffer(buffer_size);
    }
    MatrixCL.prototype.to_cpu = function () {
        var cpumat = new Matrix(this._size, this._klass);
        this.read(cpumat._data);
        return cpumat;
    };
    MatrixCL.prototype.throw_if_destructed = function () {
        if (!this._clbuffer) {
            throw new Error('Attempting use destructed matrix');
        }
    };
    MatrixCL.prototype.write = function (src_typed_array, dst_bytes_offset) {
        this.throw_if_destructed();
        if (src_typed_array.length > 0) {
            $CL.writeBuffer(this._clbuffer, src_typed_array, dst_bytes_offset);
        }
    };
    MatrixCL.prototype.read = function (dst_typed_array, src_bytes_offset) {
        this.throw_if_destructed();
        if (dst_typed_array.length > 0) {
            $CL.readBuffer(this._clbuffer, dst_typed_array, src_bytes_offset);
        }
    };
    MatrixCL._fromnativemat = function (A) {
        if (A instanceof MatrixCL) {
            return A.copy();
        }
        else {
            var matcl = new MatrixCL(A._size, A._klass);
            matcl.write(A._getdata());
            return matcl;
        }
    };
    MatrixCL._fromtypedarray = function (src_typed_array, klass) {
        var mat = new MatrixCL([1, src_typed_array.length], klass);
        mat.write(src_typed_array);
        return mat;
    };
    MatrixCL.prototype.destruct = function () {
        if (this._clbuffer) {
            $CL.releaseBuffer(this._clbuffer);
            this._clbuffer = null;
        }
    };
    MatrixCL.prototype.inspect = function (depth) {
        var shape_str = this._size.join('x');
        if (this._numel <= 100) {
            return 'MatrixCL ' + shape_str + ' ' + this._klass + '\n' + this.toString();
        }
        else {
            return 'MatrixCL ' + shape_str + ' ' + this._klass;
        }
    };
    MatrixCL.prototype._getdata = function () {
        //get copy of data in TypedArray
        var typed_array = new this._data_ctor(this._numel);
        this.read(typed_array);
        return typed_array;
    };
    MatrixCL.prototype.getdataref = function (src_offset, length) {
        if (src_offset === void 0) { src_offset = 0; }
        //get read-only view of array
        // copy minimum range of gpu array
        if (length == null) {
            length = this._numel - src_offset;
        }
        var typed_array = new this._data_ctor(length);
        this.read(typed_array, src_offset * this._data_ctor.BYTES_PER_ELEMENT);
        return typed_array;
    };
    MatrixCL.prototype.getdatacopy = function (src_offset, length, dst) {
        if (src_offset === void 0) { src_offset = 0; }
        if (length == null) {
            length = this._numel - src_offset;
        }
        if (!dst) {
            dst = new this._data_ctor(length);
        }
        var range_view = new this._data_ctor(dst.buffer, dst.byteOffset, length);
        this.read(range_view, src_offset * this._data_ctor.BYTES_PER_ELEMENT);
        return dst;
    };
    MatrixCL.prototype.setdata = function (src, dst_offset) {
        if (dst_offset === void 0) { dst_offset = 0; }
        //set raw data into buffer
        this.write(src, dst_offset * this._data_ctor.BYTES_PER_ELEMENT);
    };
    MatrixCL.get_cast_str = function (dst_klass, src_klass) {
        var cast_str;
        if (src_klass == dst_klass) {
            cast_str = '(x)';
        }
        else if (dst_klass != 'logical') {
            cast_str = '(' + dst_klass + ')(x)';
        }
        else {
            cast_str = '((x != 0) ? 1 : 0)';
        }
        return cast_str;
    };
    MatrixCL.prototype.copy = function (klass) {
        var clone = new MatrixCL(this._size, klass || this._klass);
        var kernel_name = 'copy_' + clone._klass + '_' + this._klass;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
            kernel = $CL.createKernel([
                '#define DST_TYPE ' + ctypes[clone._klass],
                '#define SRC_TYPE ' + ctypes[this._klass],
                '#define TYPE_CAST(x) ' + MatrixCL.get_cast_str(clone._klass, this._klass),
                '__kernel void kernel_func(__global DST_TYPE *dst, __global SRC_TYPE *src, uint length) {',
                '  uint i = get_global_id(0);',
                '  if (i >= length) { return; }',
                '  dst[i] = TYPE_CAST(src[i]);',
                '}'
            ].join('\n'));
            MatrixCL.kernel_cache[kernel_name] = kernel;
        }
        if (this._numel > 0) {
            $CL.executeKernel(kernel, [
                { access: WebCL.MEM_WRITE_ONLY, datum: clone },
                { access: WebCL.MEM_READ_ONLY, datum: this },
                { datum: this._numel, type: WebCL.type.UINT }
            ], this._numel);
        }
        return clone;
    };
    MatrixCL.prototype._fill = function (val) {
        var kernel_name = 'fill_' + this._klass;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
            kernel = $CL.createKernel([
                '#define DST_TYPE ' + ctypes[this._klass],
                '__kernel void kernel_func(__global DST_TYPE *dst, uint length, DST_TYPE val) {',
                '  uint i = get_global_id(0);',
                '  if (i >= length) { return; }',
                '  dst[i] = val;',
                '}'
            ].join('\n'));
            MatrixCL.kernel_cache[kernel_name] = kernel;
        }
        if (this._numel > 0) {
            $CL.executeKernel(kernel, [
                { access: WebCL.MEM_WRITE_ONLY, datum: this },
                { datum: this._numel, type: WebCL.type.UINT },
                { datum: val, type: webcltypes[this._klass] }
            ], this._numel);
        }
    };
    MatrixCL.prototype.get = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (args.length == 0) {
            // get scalar
            return this.get_scalar([1]);
        }
        var all_number = args.every(function (v) { return typeof (v) === 'number'; });
        if (all_number) {
            return this.get_scalar(args);
        }
        else {
            return this.get_matrix_nd(args);
        }
    };
    MatrixCL.prototype.get_scalar = function (inds) {
        this._isvalidindexerr(inds);
        var arrayidx = this._getarrayindex(inds);
        var dst_typed_array = new this._data_ctor(1); //read only 1 element
        this.read(dst_typed_array, arrayidx * this._data_ctor.BYTES_PER_ELEMENT);
        return dst_typed_array[0];
    };
    MatrixCL._get_ind_iterator_cl = function (ind, dim_size) {
        // return index within valid range
        if (typeof (ind) === 'number') {
            var ind_positive = ind;
            if (ind_positive < 0) {
                ind_positive += dim_size + 1;
            }
            if (ind_positive <= 0 || ind_positive > dim_size) {
                throw Error('Index exceeds matrix dimension');
            }
            return {
                kernel_arg: { datum: ind_positive, type: webcltypes.int32 },
                to_destruct: null, length: 1,
                typename: 'int'
            };
        }
        else if (ind instanceof Colon) {
            var start = ind.start;
            var stop = ind.stop;
            var step = ind.step;
            if (ind.all) {
                start = 1;
                stop = dim_size;
                step = 1;
            }
            if (start < 0) {
                start += dim_size + 1;
            }
            if (stop < 0) {
                stop += dim_size + 1;
            }
            var length = 0;
            if ((step > 0 && stop >= start) || (step < 0 && stop <= start)) {
                length = Math.floor((stop - start) / step) + 1;
                // check if in valid range
                var final_value = start + step * (length - 1);
                if ((start <= 0 || start > dim_size) || (final_value <= 0 || final_value > dim_size)) {
                    throw Error('Index exceeds matrix dimension');
                }
            }
            return {
                kernel_arg: { datum: [start, step, stop, length], type: webcltypes.int32 | WebCL.type.VEC4 },
                to_destruct: null,
                length: length,
                typename: 'int4'
            };
        }
        else if (ind instanceof Matrix) {
            var to_destruct = null;
            var ind_mat;
            if (ind instanceof MatrixCL) {
                ind_mat = ind;
            }
            else {
                ind_mat = MatrixCL._fromnativemat(ind);
                to_destruct = ind_mat;
            }
            // check if in valid range
            var kernel_name = '_get_ind_iterator_cl_' + ind._klass;
            var kernel = MatrixCL.kernel_cache[kernel_name];
            if (!kernel) {
                var kernel_str = [
                    '#define SRC_TYPE ' + ctypes[ind._klass],
                    '__kernel void kernel_func(__global int *dst, __global const SRC_TYPE *src, int dim_size, uint src_length) {',
                    '  uint i = get_global_id(0);',
                    '  if (i >= src_length) { return; }',
                    '  int src_val = (int)src[i];',
                    '  if (src_val == 0 || src_val > dim_size || src_val < -dim_size) {',
                    '    dst[0] = 1;',
                    '  }',
                    '}'
                ].join('\n');
                kernel = $CL.createKernel(kernel_str);
                MatrixCL.kernel_cache[kernel_name] = kernel;
            }
            if (ind_mat._numel > 0) {
                var validity_result = new MatrixCL([1, 1], 'int32');
                validity_result._fill(0);
                $CL.executeKernel(kernel, [
                    { access: WebCL.MEM_WRITE_ONLY, datum: validity_result },
                    { access: WebCL.MEM_READ_ONLY, datum: ind_mat },
                    { datum: dim_size, type: WebCL.type.INT },
                    { datum: ind_mat._numel, type: WebCL.type.UINT }
                ], ind_mat._numel);
                if (validity_result.getdataref()[0]) {
                    validity_result.destruct();
                    if (to_destruct) {
                        to_destruct.destruct();
                    }
                    throw Error('Index exceeds matrix dimension');
                }
                validity_result.destruct();
            }
            return {
                kernel_arg: { datum: ind_mat, access: WebCL.MEM_READ_ONLY },
                to_destruct: to_destruct,
                length: ind_mat._numel,
                typename: '__global ' + ctypes[ind_mat._klass] + ' *'
            };
        }
    };
    MatrixCL.prototype.get_matrix_nd = function (inds) {
        var inds_ndim = inds.length;
        var destruct_targets = [];
        try {
            // replace logical matrix with vector
            for (var i = 0; i < inds_ndim; i++) {
                var ind = inds[i];
                if (ind instanceof Matrix) {
                    if (ind._klass == 'logical') {
                        var idxarray = ind._find();
                        inds[i] = idxarray;
                        destruct_targets.push(idxarray);
                    }
                }
            }
            var virtual_input_shape = [];
            if (this._ndims <= inds_ndim) {
                // pad with 1
                virtual_input_shape = this._size.concat();
                while (virtual_input_shape.length < inds_ndim) {
                    virtual_input_shape.push(1);
                }
            }
            else {
                // last dimension is like linear index
                var cur_prod = 1;
                for (var dim_1 = 0; dim_1 < inds_ndim - 1; dim_1++) {
                    virtual_input_shape.push(this._size[dim_1]);
                    cur_prod *= this._size[dim_1];
                }
                virtual_input_shape.push(this._numel / cur_prod);
            }
            var virtual_input_stride = [];
            var stride_tmp = 1;
            for (var dim = 0; dim < inds_ndim; dim++) {
                virtual_input_stride.push(stride_tmp);
                stride_tmp *= virtual_input_shape[dim];
            }
            var kernel_args = [];
            var kernel_type_names = [];
            var dst_shape = [];
            var dst_stride = []; //not use dst._strides because tailing 1 dimension is omitted
            var dst_stride_tmp = 1;
            for (var dim = 0; dim < inds_ndim; dim++) {
                var iter_and_length = MatrixCL._get_ind_iterator_cl(inds[dim], virtual_input_shape[dim]);
                if (iter_and_length.to_destruct) {
                    destruct_targets.push(iter_and_length.to_destruct);
                }
                kernel_args.push(iter_and_length.kernel_arg);
                kernel_type_names.push(iter_and_length.typename);
                dst_shape.push(iter_and_length.length);
                dst_stride.push(dst_stride_tmp);
                dst_stride_tmp *= iter_and_length.length;
            }
            var dst_numel = dst_stride_tmp;
            var dst_reshape_shape = null;
            if (inds_ndim == 1) {
                // linear indexing case
                dst_shape.push(1); //avoid error on new Matrix()
                // if ind is logical matrix, regarded as vector in the following
                // colon is row vector
                // src and ind are both vectors => follows direction of src
                // otherwise: follows ind's shape
                var is_ind_vector = false;
                var only_ind = inds[0];
                if (only_ind instanceof Matrix) {
                    if (only_ind._ndims == 2 && (only_ind._size[0] == 1 || only_ind._size[1] == 1)) {
                        is_ind_vector = true;
                    }
                }
                else if (only_ind instanceof Colon) {
                    is_ind_vector = true;
                }
                var is_src_vector = false;
                if (this._ndims == 2 && (this._size[0] == 1 || this._size[1] == 1)) {
                    is_src_vector = true;
                }
                if (is_src_vector && is_ind_vector) {
                    // follow direction of src
                    if (this._size[0] == 1) {
                        // reshape to row vector
                        dst_reshape_shape = [1, dst_shape[0]];
                    }
                }
                else {
                    // follow ind's shape
                    if (only_ind instanceof Matrix) {
                        dst_reshape_shape = only_ind._size;
                    }
                    else if (only_ind instanceof Colon) {
                        // reshape to row vector
                        dst_reshape_shape = [1, dst_shape[0]];
                    }
                }
            }
            var dst = new MatrixCL(dst_shape, this._klass);
            var kernel_name = 'get_matrix_nd_' + this._klass + '_' + inds_ndim + '_' + kernel_type_names.join(',');
            var kernel = MatrixCL.kernel_cache[kernel_name];
            if (!kernel) {
                var kernel_index_args_str = '';
                for (var dim = 0; dim < inds_ndim; dim++) {
                    kernel_index_args_str += ',' + kernel_type_names[dim] + ' ind' + dim; //variable ind0, ind1, ...
                }
                var kernel_add_dim = '';
                for (var dim = 0; dim < inds_ndim; dim++) {
                    kernel_add_dim += 'ADD_IND(' + dim + ');';
                }
                var kernel_get_ind_func = '';
                for (var dim = 0; dim < inds_ndim; dim++) {
                    kernel_get_ind_func += 'int get_ind' + dim;
                    var kernel_type_name = kernel_type_names[dim];
                    switch (kernel_type_name) {
                        case 'int':
                            kernel_get_ind_func += '(int indexer, int offset, int dim_size) {return indexer;}';
                            break;
                        case 'int4':
                            kernel_get_ind_func += '(int4 indexer, int offset, int dim_size) {return indexer.x + indexer.y * offset;}';
                            break;
                        default:
                            kernel_get_ind_func += '(' + kernel_type_name + ' indexer, int offset, int dim_size) {int val = (int)indexer[offset]; if (val < 0) { return val + dim_size + 1; } else { return val; }}';
                            break;
                    }
                    kernel_get_ind_func += '\n';
                }
                var kernel_str = [
                    '#define DIMS ' + inds_ndim,
                    '#define SRC_DST_TYPE ' + ctypes[this._klass],
                    kernel_get_ind_func,
                    '#define ADD_IND(dim) {dst_coord = (i / dst_stride[dim]) % dst_shape[dim]; src_coord = (get_ind ## dim(ind ## dim, dst_coord, src_shape[dim])) - 1; src_linear_index += src_coord * src_stride[dim];}',
                    '__kernel void kernel_func(__global SRC_DST_TYPE *dst, __global const SRC_DST_TYPE *src, __global const int *size_strides, uint output_length',
                    kernel_index_args_str,
                    ') {',
                    '  uint i = get_global_id(0);',
                    '  if (i >= output_length) { return; }',
                    '  __global const int *src_stride = size_strides, *src_shape = size_strides + DIMS * 1, *dst_stride = size_strides + DIMS * 2, *dst_shape = size_strides + DIMS * 3;',
                    '  int dst_coord, src_coord;',
                    '  int src_linear_index = 0;',
                    kernel_add_dim,
                    '  dst[i] = src[src_linear_index];',
                    '}'
                ].join('\n');
                kernel = $CL.createKernel(kernel_str);
                MatrixCL.kernel_cache[kernel_name] = kernel;
            }
            if (dst_numel > 0) {
                var size_strides = []; //src_stride/src_shape/dst_stride/dst_shape; dst_shape is last because [1] may be added above
                size_strides.push.apply(size_strides, virtual_input_stride);
                size_strides.push.apply(size_strides, virtual_input_shape);
                size_strides.push.apply(size_strides, dst_stride);
                size_strides.push.apply(size_strides, dst_shape);
                var size_strides_mat = MatrixCL._fromtypedarray(new Int32Array(size_strides), 'int32');
                destruct_targets.push(size_strides_mat);
                kernel_args.unshift({ access: WebCL.MEM_WRITE_ONLY, datum: dst }, { access: WebCL.MEM_READ_ONLY, datum: this }, { access: WebCL.MEM_READ_ONLY, datum: size_strides_mat }, { datum: dst_numel, type: WebCL.type.UINT });
                $CL.executeKernel(kernel, kernel_args, dst_numel);
            }
            if (dst_reshape_shape) {
                dst.reshape_inplace(dst_reshape_shape);
            }
            return dst;
        }
        finally {
            for (var i = 0; i < destruct_targets.length; i++) {
                destruct_targets[i].destruct();
            }
        }
    };
    MatrixCL.prototype.set = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        //last argument is value, but subsequent function requires first argument to be value
        var val = args.pop();
        if (!(val instanceof Matrix) && val.length !== void 0) {
            // js array (or array-like)
            val = Matrix.jsa2mat(val, false, this._klass);
        }
        // scalar matrix converted to number
        if (val instanceof Matrix && val._numel == 1) {
            val = val.get_scalar([1]);
        }
        var all_number = args.every(function (v) { return typeof (v) === 'number'; });
        if (all_number) {
            this.set_scalar(val, args);
        }
        else {
            this.set_matrix_nd(val, args);
        }
    };
    MatrixCL.prototype.set_scalar = function (val, inds) {
        this._isvalidindexerr(inds);
        var arrayidx = this._getarrayindex(inds);
        var scalar_val;
        if (val instanceof Matrix) {
            if (val._numel != 1) {
                throw new Error('Value is not scalar');
            }
            scalar_val = val.get_scalar([1]);
        }
        else {
            scalar_val = val;
        }
        if (Matrix._logical_cast_required(this._klass)) {
            scalar_val = Matrix._logical_cast(scalar_val);
        }
        var typed_array = new this._data_ctor(1);
        typed_array[0] = scalar_val;
        this.write(typed_array, arrayidx * this._data_ctor.BYTES_PER_ELEMENT);
    };
    MatrixCL.cast_scalar_val = function (val, klass) {
        switch (klass) {
            case 'int32':
                val = val | 0;
                break;
            case 'uint8':
                val = val & 0xFF;
                break;
            case 'logical':
                val = val ? 1 : 0;
                break;
        }
        return val;
    };
    MatrixCL.prototype.set_matrix_single = function (val, singleind) {
        var index_mat;
        var destruct_index_mat = true;
        var val_mat;
        var destruct_val_mat = false;
        var input_size;
        if (singleind instanceof Colon) {
            var single_idx_array = singleind.tojsa(this._numel);
            input_size = [1, single_idx_array.length]; //row vector
            index_mat = new MatrixCL(input_size, 'int32');
            index_mat.write(new Int32Array(single_idx_array));
        }
        else if (singleind instanceof MatrixCL) {
            index_mat = singleind;
            destruct_index_mat = false;
        }
        else if (singleind instanceof Matrix) {
            index_mat = MatrixCL._fromnativemat(singleind);
        }
        try {
            if (val instanceof Matrix) {
                if (index_mat._numel != val._numel) {
                    throw new Error('Dimension mismatch');
                }
                if (val instanceof MatrixCL) {
                    val_mat = val;
                }
                else {
                    val_mat = MatrixCL._fromnativemat(val);
                    destruct_val_mat = true;
                }
                var kernel_name = 'set_matrix_single_matrix_' + this._klass + '_' + val_mat._klass + '_' + index_mat._klass;
                var kernel = MatrixCL.kernel_cache[kernel_name];
                if (!kernel) {
                    kernel = $CL.createKernel([
                        '#define SRC_TYPE ' + ctypes[val_mat._klass],
                        '#define DST_TYPE ' + ctypes[this._klass],
                        '#define INDEX_TYPE ' + ctypes[index_mat._klass],
                        '#define TYPE_CAST(x) ' + MatrixCL.get_cast_str(this._klass, val_mat._klass),
                        '__kernel void kernel_func(__global DST_TYPE *dst, __global SRC_TYPE *src, __global INDEX_TYPE *index, uint index_length) {',
                        '  uint i = get_global_id(0);',
                        '  if (i >= index_length) { return; }',
                        '  dst[(uint)index[i]-1] = TYPE_CAST(src[i]);',
                        '}'
                    ].join('\n'));
                    MatrixCL.kernel_cache[kernel_name] = kernel;
                }
                if (index_mat._numel > 0) {
                    $CL.executeKernel(kernel, [
                        { access: WebCL.MEM_WRITE_ONLY, datum: this },
                        { access: WebCL.MEM_READ_ONLY, datum: val_mat },
                        { access: WebCL.MEM_READ_ONLY, datum: index_mat },
                        { datum: index_mat._numel, type: WebCL.type.UINT }
                    ], index_mat._numel);
                }
            }
            else {
                var kernel_name = 'set_matrix_single_scalar_' + this._klass + '_' + index_mat._klass;
                var kernel = MatrixCL.kernel_cache[kernel_name];
                if (!kernel) {
                    kernel = $CL.createKernel([
                        '#define DST_TYPE ' + ctypes[this._klass],
                        '#define INDEX_TYPE ' + ctypes[index_mat._klass],
                        '__kernel void kernel_func(__global DST_TYPE *dst, DST_TYPE src, __global INDEX_TYPE *index, uint index_length) {',
                        '  uint i = get_global_id(0);',
                        '  if (i >= index_length) { return; }',
                        '  dst[(uint)index[i]-1] = src;',
                        '}'
                    ].join('\n'));
                    MatrixCL.kernel_cache[kernel_name] = kernel;
                }
                var scalar_val = MatrixCL.cast_scalar_val(val, this._klass);
                if (index_mat._numel > 0) {
                    $CL.executeKernel(kernel, [
                        { access: WebCL.MEM_WRITE_ONLY, datum: this },
                        { datum: scalar_val, type: webcltypes[this._klass] },
                        { access: WebCL.MEM_READ_ONLY, datum: index_mat },
                        { datum: index_mat._numel, type: WebCL.type.UINT }
                    ], index_mat._numel);
                }
            }
        }
        catch (error) {
            throw error;
        }
        finally {
            if (destruct_index_mat) {
                index_mat.destruct();
            }
        }
    };
    MatrixCL.prototype.set_matrix_nd = function (val, inds) {
        var inds_ndim = inds.length;
        var destruct_targets = [];
        try {
            // replace logical matrix with vector
            for (var i = 0; i < inds_ndim; i++) {
                var ind = inds[i];
                if (ind instanceof Matrix) {
                    if (ind._klass == 'logical') {
                        var idxarray = ind._find();
                        inds[i] = idxarray;
                        destruct_targets.push(idxarray);
                    }
                }
            }
            var virtual_input_shape = [];
            if (this._ndims <= inds_ndim) {
                // pad with 1
                virtual_input_shape = this._size.concat();
                while (virtual_input_shape.length < inds_ndim) {
                    virtual_input_shape.push(1);
                }
            }
            else {
                // last dimension is like linear index
                var cur_prod = 1;
                for (var dim_2 = 0; dim_2 < inds_ndim - 1; dim_2++) {
                    virtual_input_shape.push(this._size[dim_2]);
                    cur_prod *= this._size[dim_2];
                }
                virtual_input_shape.push(this._numel / cur_prod);
            }
            var virtual_input_stride = [];
            var stride_tmp = 1;
            for (var dim = 0; dim < inds_ndim; dim++) {
                virtual_input_stride.push(stride_tmp);
                stride_tmp *= virtual_input_shape[dim];
            }
            var kernel_args = [];
            var kernel_type_names = [];
            var dst_shape = [];
            var dst_stride = []; //not use dst._strides because tailing 1 dimension is omitted
            var dst_stride_tmp = 1;
            var squeezed_dst_shape = [];
            for (var dim = 0; dim < inds_ndim; dim++) {
                var iter_and_length = MatrixCL._get_ind_iterator_cl(inds[dim], virtual_input_shape[dim]);
                if (iter_and_length.to_destruct) {
                    destruct_targets.push(iter_and_length.to_destruct);
                }
                kernel_args.push(iter_and_length.kernel_arg);
                kernel_type_names.push(iter_and_length.typename);
                dst_shape.push(iter_and_length.length);
                if (iter_and_length.length != 1) {
                    squeezed_dst_shape.push(iter_and_length.length);
                }
                dst_stride.push(dst_stride_tmp);
                dst_stride_tmp *= iter_and_length.length;
            }
            var dst_numel = dst_stride_tmp;
            var val_is_matrix = false;
            if (val instanceof Matrix) {
                if (val._numel == 1) {
                    //1x1 mat: treat as scalar
                    val = val.get();
                }
                else {
                    val_is_matrix = true;
                    if (!(val instanceof MatrixCL)) {
                        // cpu matrix
                        val = MatrixCL._fromnativemat(val);
                        destruct_targets.push(val);
                    }
                }
            }
            if (val_is_matrix) {
                // check shape
                // squeezed_dst_shape is 1-d, number of element must match
                // otherwise, squeezed shape of val must match
                var val_numel = val._numel;
                var raise_error = false;
                if (squeezed_dst_shape.length == 0) {
                    // set of scalar
                    if (val_numel != 1) {
                        raise_error = true;
                    }
                }
                else if (squeezed_dst_shape.length == 1) {
                    if (val_numel != squeezed_dst_shape[0]) {
                        raise_error = true;
                    }
                }
                else {
                    var val_shape = val._size;
                    var squeezed_val_shape = val_shape.filter(function (v) { return v != 1; });
                    if (!squeezed_val_shape.every(function (v, i) { return v == squeezed_dst_shape[i]; })) {
                        raise_error = true;
                    }
                }
                if (raise_error) {
                    throw new Error('The shape of matrix does not fit');
                }
            }
            var kernel_name = 'set_matrix_nd_' + this._klass + '_' + val_is_matrix + '_' + inds_ndim + '_' + kernel_type_names.join(',');
            var kernel = MatrixCL.kernel_cache[kernel_name];
            if (!kernel) {
                var kernel_index_args_str = '';
                for (var dim = 0; dim < inds_ndim; dim++) {
                    kernel_index_args_str += ',' + kernel_type_names[dim] + ' ind' + dim; //variable ind0, ind1, ...
                }
                var kernel_add_dim = '';
                for (var dim = 0; dim < inds_ndim; dim++) {
                    kernel_add_dim += 'ADD_IND(' + dim + ');';
                }
                var kernel_get_ind_func = '';
                for (var dim = 0; dim < inds_ndim; dim++) {
                    kernel_get_ind_func += 'int get_ind' + dim;
                    var kernel_type_name = kernel_type_names[dim];
                    switch (kernel_type_name) {
                        case 'int':
                            kernel_get_ind_func += '(int indexer, int offset, int dim_size) {return indexer;}';
                            break;
                        case 'int4':
                            kernel_get_ind_func += '(int4 indexer, int offset, int dim_size) {return indexer.x + indexer.y * offset;}';
                            break;
                        default:
                            kernel_get_ind_func += '(' + kernel_type_name + ' indexer, int offset, int dim_size) {int val = (int)indexer[offset]; if (val < 0) { return val + dim_size + 1; } else { return val; }}';
                            break;
                    }
                    kernel_get_ind_func += '\n';
                }
                var kernel_str = [
                    '#define DIMS ' + inds_ndim,
                    '#define SRC_TYPE ' + ctypes[this._klass],
                    '#define DST_TYPE ' + ctypes[val_is_matrix ? val._klass : this._klass],
                    '#define TYPE_CAST(x) ' + MatrixCL.get_cast_str(this._klass, val_is_matrix ? val._klass : this._klass),
                    kernel_get_ind_func,
                    '#define ADD_IND(dim) {dst_coord = (i / dst_stride[dim]) % dst_shape[dim]; src_coord = (get_ind ## dim(ind ## dim, dst_coord, src_shape[dim])) - 1; src_linear_index += src_coord * src_stride[dim];}',
                    '__kernel void kernel_func(',
                    val_is_matrix ? '__global const DST_TYPE *dst' : 'DST_TYPE dst',
                    ', __global SRC_TYPE *src, __global const int *size_strides, uint output_length',
                    kernel_index_args_str,
                    ') {',
                    '  uint i = get_global_id(0);',
                    '  if (i >= output_length) { return; }',
                    '  __global const int *src_stride = size_strides, *src_shape = size_strides + DIMS * 1, *dst_stride = size_strides + DIMS * 2, *dst_shape = size_strides + DIMS * 3;',
                    '  int dst_coord, src_coord;',
                    '  int src_linear_index = 0;',
                    kernel_add_dim,
                    val_is_matrix ? '  src[src_linear_index] = TYPE_CAST(dst[i]);' : '  src[src_linear_index] = TYPE_CAST(dst);',
                    '}'
                ].join('\n');
                kernel = $CL.createKernel(kernel_str);
                MatrixCL.kernel_cache[kernel_name] = kernel;
            }
            if (dst_numel > 0) {
                var size_strides = []; //src_stride/src_shape/dst_stride/dst_shape; dst_shape is last because [1] may be added above
                size_strides.push.apply(size_strides, virtual_input_stride);
                size_strides.push.apply(size_strides, virtual_input_shape);
                size_strides.push.apply(size_strides, dst_stride);
                size_strides.push.apply(size_strides, dst_shape);
                var size_strides_mat = MatrixCL._fromtypedarray(new Int32Array(size_strides), 'int32');
                destruct_targets.push(size_strides_mat);
                kernel_args.unshift({ access: WebCL.MEM_WRITE_ONLY, datum: this }, { access: WebCL.MEM_READ_ONLY, datum: size_strides_mat }, { datum: dst_numel, type: WebCL.type.UINT });
                if (val_is_matrix) {
                    kernel_args.unshift({ access: WebCL.MEM_READ_ONLY, datum: val });
                }
                else {
                    kernel_args.unshift({ datum: val, type: webcltypes[this._klass] });
                }
                $CL.executeKernel(kernel, kernel_args, dst_numel);
            }
        }
        finally {
            for (var i = 0; i < destruct_targets.length; i++) {
                destruct_targets[i].destruct();
            }
        }
    };
    MatrixCL.prototype._find = function () {
        //not paralleled; very slow
        //first, count output size
        var count_mat = new MatrixCL([1, 2], 'int32');
        var kernel_name = 'matrix_find_count_' + this._klass;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
            kernel = $CL.createKernel([
                '#define SRC_TYPE ' + ctypes[this._klass],
                '__kernel void kernel_func(__global int *count, __global SRC_TYPE *logical_index, uint numel) {',
                '  int ctr = 0;',
                '  int max_i = -1;',
                '  if (get_global_id(0) > 0) {return;}',
                '  for (uint i = 0; i < numel; i++) {',
                '    SRC_TYPE val = logical_index[i];',
                '    if (val) {',
                '      ctr++;',
                '      max_i = i;',
                '    }',
                '  }',
                '  count[0] = ctr;',
                '  count[1] = max_i;',
                '}'
            ].join('\n'));
            MatrixCL.kernel_cache[kernel_name] = kernel;
        }
        var count_array = new Int32Array(2); //default value 0
        if (this._numel > 0) {
            $CL.executeKernel(kernel, [
                { access: WebCL.MEM_WRITE_ONLY, datum: count_mat },
                { access: WebCL.MEM_READ_ONLY, datum: this },
                { datum: this._numel, type: WebCL.type.UINT }
            ], 1);
            count_mat.read(count_array);
        }
        var output_length = count_array[0];
        var max_i = count_array[1];
        //second, write indices
        var output = new MatrixCL([output_length, 1], 'int32');
        var kernel_name = 'matrix_find_write_' + this._klass;
        var kernel = MatrixCL.kernel_cache[kernel_name];
        if (!kernel) {
            kernel = $CL.createKernel([
                '#define SRC_TYPE ' + ctypes[this._klass],
                '__kernel void kernel_func(__global int *dst, __global SRC_TYPE *src, uint output_length) {',
                '  uint i = get_global_id(0);',
                '  if (i > 0) { return; }',
                '  int out_idx = 0;',
                '  int in_idx = 0;',
                '  while (out_idx < output_length) {',
                '    if (src[in_idx]) {',
                '      dst[out_idx++] = in_idx + 1;',
                '    }',
                '    in_idx++;',
                '  }',
                '}'
            ].join('\n'));
            MatrixCL.kernel_cache[kernel_name] = kernel;
        }
        if (output_length > 0) {
            $CL.executeKernel(kernel, [
                { access: WebCL.MEM_WRITE_ONLY, datum: output },
                { access: WebCL.MEM_READ_ONLY, datum: this },
                { datum: output_length, type: WebCL.type.UINT }
            ], 1);
        }
        if (this._size[1] == this._numel) {
            // row vector
            output.reshape_inplace(this._size);
        }
        count_mat.destruct();
        return output;
    };
    MatrixCL.kernel_cache = {};
    return MatrixCL;
}(Matrix));
module.exports = MatrixCL;

},{"../colon":12,"../matrix":16,"./handwrittenjs/driver":4}],12:[function(require,module,exports){
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
// colon object
// $M.colon(1,3,10) or $M.colon.fromstring('1:3:10');
"use strict";
var Colon = (function () {
    function Colon(start, stop_step, stop) {
        this.start = start;
        this.step = 1;
        if (this.start == null) {
            this.all = true;
        }
        else {
            if (stop != null) {
                // start:step:stop
                this.step = stop_step;
                this.stop = stop;
            }
            else {
                // start:1:stop
                this.stop = stop_step;
            }
        }
    }
    Colon.fromstring = function (s) {
        var elements = s.replace('end', '-1').split(':');
        var nums = [];
        for (var i = 0; i < elements.length; i++) {
            nums.push(eval(elements[i] || 'null'));
        }
        if (elements.length == 2) {
            return new Colon(nums[0], nums[1]);
        }
        else if (elements.length == 3) {
            return new Colon(nums[0], nums[1], nums[2]);
        }
        else {
            throw new Error('Invalid format');
        }
    };
    Colon.prototype.tojsa = function (size) {
        var start = this.start;
        var stop = this.stop;
        var step = this.step;
        if (this.all) {
            start = 1;
            stop = size;
            step = 1;
        }
        if (start < 0) {
            start += size + 1;
        }
        if (stop < 0) {
            stop += size + 1;
        }
        var jsa = [];
        if (step > 0) {
            for (var i = start; i <= stop; i += step) {
                jsa.push(i);
            }
        }
        else if (step < 0) {
            for (var i = start; i >= stop; i += step) {
                jsa.push(i);
            }
        } //step == 0 means length 0
        return jsa;
    };
    Colon.prototype.toString = function () {
        if (this.start == null) {
            return ':';
        }
        else {
            if (this.step == null) {
                return colonedge2str(this.start) + ':' + colonedge2str(this.stop);
            }
            else {
                return colonedge2str(this.start) + ':' + this.step + ':' + colonedge2str(this.stop);
            }
        }
    };
    return Colon;
}());
function colonedge2str(val) {
    if (val >= 0) {
        return '' + val;
    }
    else {
        if (val == 0) {
            return 'end';
        }
        return 'end-' + (-1 - val);
    }
}
module.exports = Colon;

},{}],13:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Colon = require('./colon');
function colon(start, stop_step, stop) {
    return new Colon(start, stop_step, stop);
}
var colon;
(function (colon) {
    colon.s = Colon.fromstring;
})(colon || (colon = {}));
module.exports = colon;

},{"./colon":12}],14:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Matrix = require('./matrix');
var util = require('./util');
function make_compare_func_all(operation) {
    var func_s_s = make_binary_arith_func(operation, false, false, 'logical');
    var func_s_m = make_binary_arith_func(operation, false, true, 'logical');
    var func_m_s = make_binary_arith_func(operation, true, false, 'logical');
    var func_m_m = make_binary_arith_func(operation, true, true, 'logical');
    return function (A, B) {
        A = util.force_cpu_scalar(A);
        B = util.force_cpu_scalar(B);
        if (A instanceof Matrix) {
            if (B instanceof Matrix) {
                return func_m_m(A, B);
            }
            else {
                return func_m_s(A, B);
            }
        }
        else {
            if (B instanceof Matrix) {
                return func_s_m(A, B);
            }
            else {
                return func_s_s(A, B);
            }
        }
    };
}
exports.make_compare_func_all = make_compare_func_all;
function make_binary_arith_func(operation, a_mat, b_mat, dst_klass) {
    var l_shape;
    var l_size_check = '';
    var l_def_adata = '';
    var l_def_bdata = '';
    var l_get_a;
    var l_get_b;
    if (a_mat) {
        l_shape = 'A._size';
        l_def_adata = 'var a_data = A._data;';
        l_get_a = 'a_data[i]';
        if (b_mat) {
            l_size_check = 'if (!e_util.jsaequal(A._size, B._size)) {throw new Error("Dimension mismatch");}';
        }
    }
    else {
        l_get_a = 'A';
        if (b_mat) {
            l_shape = 'B._size';
        }
        else {
            l_shape = '[1,1]';
        }
    }
    if (b_mat) {
        l_def_bdata = 'var b_data = B._data;';
        l_get_b = 'b_data[i]';
    }
    else {
        l_get_b = 'B';
    }
    var l_opr_formatted = operation.replace('%a', l_get_a).replace('%b', l_get_b);
    var f;
    var e_Matrix = Matrix;
    var e_util = util;
    eval([
        'f = function(A, B) {',
        'var shape = ' + l_shape + ';',
        l_size_check,
        l_def_adata,
        l_def_bdata,
        'var dst = new e_Matrix(shape, "' + dst_klass + '");',
        'var dst_data = dst._data;',
        'for (var i = 0, length = dst._numel; i < length; i++) {',
        '  dst_data[i] = ' + l_opr_formatted + ';',
        '}',
        'return dst;',
        '}'
    ].join('\n'));
    return f;
}
exports.make_binary_arith_func = make_binary_arith_func;
function make_binary_arith_func_all(operation) {
    var funcs = {};
    return function (A, B) {
        var dst_klass = util.commonklass(A, B);
        A = util.force_cpu_scalar(A);
        B = util.force_cpu_scalar(B);
        if (dst_klass == 'logical') {
            dst_klass = 'single';
        }
        var a_mat = A instanceof Matrix;
        var b_mat = B instanceof Matrix;
        var func_name = '' + a_mat + '_' + b_mat + '_' + dst_klass;
        var f = funcs[func_name];
        if (!f) {
            // compile (eval) function on first call
            f = make_binary_arith_func(operation, a_mat, b_mat, dst_klass);
            funcs[func_name] = f;
        }
        return f(A, B);
    };
}
exports.make_binary_arith_func_all = make_binary_arith_func_all;
function make_unary_arith_func(operation, a_mat, dst_klass) {
    var l_shape;
    var l_def_adata = '';
    var l_get_a;
    if (a_mat) {
        l_shape = 'A._size';
        l_def_adata = 'var a_data = A._data;';
        l_get_a = 'a_data[i]';
    }
    else {
        l_shape = '[1,1]';
        l_get_a = 'A';
    }
    var l_opr_formatted = operation.replace(/%a/g, l_get_a);
    var f;
    var e_Matrix = Matrix;
    var e_util = util;
    eval([
        'f = function(A) {',
        'var shape = ' + l_shape + ';',
        l_def_adata,
        'var dst = new e_Matrix(shape, "' + dst_klass + '");',
        'var dst_data = dst._data;',
        'for (var i = 0, length = dst._numel; i < length; i++) {',
        '  dst_data[i] = ' + l_opr_formatted + ';',
        '}',
        'return dst;',
        '}'
    ].join('\n'));
    return f;
}
exports.make_unary_arith_func = make_unary_arith_func;
function make_unary_arith_func_all(operation) {
    var funcs = {};
    return function (A) {
        var dst_klass;
        if (A instanceof Matrix) {
            dst_klass = A._klass;
            if (dst_klass == 'logical') {
                dst_klass = 'single';
            }
        }
        else {
            dst_klass = 'single';
        }
        A = util.force_cpu_scalar(A);
        var a_mat = A instanceof Matrix;
        var func_name = '' + a_mat + '_' + dst_klass;
        var f = funcs[func_name];
        if (!f) {
            // compile (eval) function on first call
            f = make_unary_arith_func(operation, a_mat, dst_klass);
            funcs[func_name] = f;
        }
        return f(A);
    };
}
exports.make_unary_arith_func_all = make_unary_arith_func_all;
function isequal_two(A, B) {
    A = A.to_cpu();
    B = B.to_cpu();
    if (!util.issamesize(A._size, B._size)) {
        return false;
    }
    //(1,1)=>true,(NaN,NaN)=>false,(NaN,1)=>false
    var a_data = A._data;
    var b_data = B._data;
    for (var i = 0, length = a_data.length; i < length; i++) {
        if (a_data[i] !== b_data[i]) {
            // NaN !== NaN
            return false;
        }
    }
    return true;
}
function isequal() {
    var As = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        As[_i - 0] = arguments[_i];
    }
    if (!(As[0] instanceof Matrix)) {
        return false;
    } //scalar is not allowed
    for (var i = 1; i < As.length; i++) {
        if (!(As[i] instanceof Matrix)) {
            return false;
        }
        if (!isequal_two(As[0], As[i])) {
            return false;
        }
    }
    return true;
}
exports.isequal = isequal;
function isequaln_two(A, B) {
    A = A.to_cpu();
    B = B.to_cpu();
    if (!util.issamesize(A._size, B._size)) {
        return false;
    }
    //(1,1)=>true,(NaN,NaN)=>true,(NaN,1)=>false
    var a_data = A._data;
    var b_data = B._data;
    for (var i = 0, length = a_data.length; i < length; i++) {
        var val_a = a_data[i], val_b = b_data[i];
        if (val_a !== val_b) {
            // NaN !== NaN
            if ((val_a === val_a) || (val_b === val_b)) {
                return false;
            }
        }
    }
    return true;
}
function isequaln() {
    var As = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        As[_i - 0] = arguments[_i];
    }
    if (!(As[0] instanceof Matrix)) {
        return false;
    } //scalar is not allowed
    for (var i = 1; i < As.length; i++) {
        if (!(As[i] instanceof Matrix)) {
            return false;
        }
        if (!isequaln_two(As[0], As[i])) {
            return false;
        }
    }
    return true;
}
exports.isequaln = isequaln;
function make_isclose_func_all() {
    var func_s_s = make_isclose_func(false, false);
    var func_s_m = make_isclose_func(false, true);
    var func_m_s = make_isclose_func(true, false);
    var func_m_m = make_isclose_func(true, true);
    return function (A, B, rtol, atol, equal_nan) {
        if (rtol === void 0) { rtol = 1e-5; }
        if (atol === void 0) { atol = 1e-8; }
        if (equal_nan === void 0) { equal_nan = false; }
        A = util.force_cpu_scalar(A);
        B = util.force_cpu_scalar(B);
        if (A instanceof Matrix) {
            if (B instanceof Matrix) {
                return func_m_m(A, B, rtol, atol, equal_nan);
            }
            else {
                return func_m_s(A, B, rtol, atol, equal_nan);
            }
        }
        else {
            if (B instanceof Matrix) {
                return func_s_m(A, B, rtol, atol, equal_nan);
            }
            else {
                return func_s_s(A, B, rtol, atol, equal_nan);
            }
        }
    };
}
function make_isclose_func(a_mat, b_mat) {
    var l_shape;
    var l_size_check = '';
    var l_def_adata = '';
    var l_def_bdata = '';
    var l_get_a;
    var l_get_b;
    if (a_mat) {
        l_shape = 'A._size';
        l_def_adata = 'var a_data = A._data;';
        l_get_a = 'a_data[i]';
        if (b_mat) {
            l_size_check = 'if (!e_util.jsaequal(A._size, B._size)) {throw new Error("Dimension mismatch");}';
        }
    }
    else {
        l_get_a = 'A';
        if (b_mat) {
            l_shape = 'B._size';
        }
        else {
            l_shape = '[1,1]';
        }
    }
    if (b_mat) {
        l_def_bdata = 'var b_data = B._data;';
        l_get_b = 'b_data[i]';
    }
    else {
        l_get_b = 'B';
    }
    var f;
    var e_Matrix = Matrix;
    var e_util = util;
    eval([
        'f = function(A, B, rtol, atol, equal_nan) {',
        'var shape = ' + l_shape + ';',
        l_size_check,
        l_def_adata,
        l_def_bdata,
        'var dst = new e_Matrix(shape, "logical");',
        'var dst_data = dst._data;',
        'if (equal_nan) {',
        '  for (var i = 0, length = dst._numel; i < length; i++) {',
        '    var val_a = ' + l_get_a + ';',
        '    var val_b = ' + l_get_b + ';',
        '    var absdiff = val_a - val_b;',
        '    if (absdiff < 0) {absdiff = -absdiff}',
        '    var ret = 0;',
        '    if (absdiff <= atol + rtol * ((val_b > 0) ? val_b : -val_b)) {',
        '      ret = 1;',
        '    }',
        '    if ((val_a !== val_a) && (val_b !== val_b)) {',
        '      ret = 1;',
        '    }',
        '    dst_data[i] = ret;',
        '  }',
        '} else {',
        '  for (var i = 0, length = dst._numel; i < length; i++) {',
        '    var val_a = ' + l_get_a + ';',
        '    var val_b = ' + l_get_b + ';',
        '    var absdiff = val_a - val_b;',
        '    if (absdiff < 0) {absdiff = -absdiff}',
        '    var ret = 0;',
        '    if (absdiff <= atol + rtol * ((val_b > 0) ? val_b : -val_b)) {',
        '      ret = 1;',
        '    }',
        '    dst_data[i] = ret;',
        '  }',
        '}',
        'return dst;',
        '}'
    ].join('\n'));
    return f;
}
exports.make_isclose_func = make_isclose_func;
exports.isclose = make_isclose_func_all();
function allclose(A, B, rtol, atol, equal_nan) {
    var isclose_result = exports.isclose(A, B, rtol, atol, equal_nan);
    var data = isclose_result.getdataref();
    var prod = 1;
    for (var i = 0; i < data.length; i++) {
        prod *= data[i];
    }
    return prod != 0;
}
exports.allclose = allclose;

},{"./matrix":16,"./util":22}],15:[function(require,module,exports){
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
// read/write numpy format matrix file
"use strict";
var Matrix = require('../matrix');
function parse_header(header_data) {
    //{'descr': '<i4', 'fortran_order': False, 'shape': (3, 1), }            \n
    var header_str = '';
    for (var i = 0; i < header_data.length; i++) {
        var element = header_data[i];
        header_str += String.fromCharCode(element);
    }
    var hobj = /^\{'descr': '(.*)', 'fortran_order': (True|False), 'shape': \(([0-9, ]+)\), \} *\n$/.exec(header_str);
    if (hobj == null) {
        throw Error('Failed to parse header string');
    }
    var typechars = hobj[1]; //"<i4"
    var little_endian = true;
    switch (typechars.substr(0, 1)) {
        case "<":
        case "|":
            little_endian = true;
            break;
        case ">":
            little_endian = false;
            break;
        default:
            throw Error('Unknown endian');
    }
    var descr_wo_endian = typechars.substr(1, 2);
    var fortran_order = hobj[2] == 'True';
    var shape_str = hobj[3].split(',');
    var shape;
    if (shape_str[1] == '') {
        //1-d array (3,) to column vector (3,1)
        shape = [Number(shape_str[0]), 1];
    }
    else {
        shape = shape_str.map(function (v) { return Number(v.trim()); });
    }
    return { descr_wo_endian: descr_wo_endian, fortran_order: fortran_order, shape: shape, little_endian: little_endian };
}
function is_little_endian() {
    /**
     * Check if this machine is little endian
     */
    var raw = new Uint8Array([0x1, 0x2, 0x3, 0x4]);
    var view = new Uint32Array(raw.buffer);
    if (view[0] == 0x01020304) {
        //big endian
        return false;
    }
    else {
        return true;
    }
}
var mat_klass_map = {
    'b1': 'logical',
    'u1': 'uint8',
    'i4': 'int32',
    'f4': 'single',
    'f8': 'single'
};
var view_accessor_map = {
    'b1': DataView.prototype.getUint8,
    'u1': DataView.prototype.getUint8,
    'i4': DataView.prototype.getInt32,
    'f4': DataView.prototype.getFloat32,
    'f8': DataView.prototype.getFloat64
};
var view_bytestep_map = { 'b1': 1, 'u1': 1, 'i4': 4, 'f4': 4, 'f8': 8 };
function npyread(data) {
    //for node: npyread(fs.readFileSync())
    var byteOffset = 0;
    if (ArrayBuffer.isView(data)) {
        //data is Uint8Array
        byteOffset = data.byteOffset;
        data = data.buffer;
    }
    var header_view = new Uint8Array(data, byteOffset);
    //check magic number
    var expect_header = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00]; //only format 1 supported
    for (var i = 0; i < expect_header.length; i++) {
        if (header_view[i] != expect_header[i]) {
            throw Error('Incompatible format header');
        }
    }
    var header_len = header_view[8] + header_view[9] * 256; //16bit little endian
    var data_type = parse_header(header_view.slice(10, 10 + header_len));
    var mat_klass = mat_klass_map[data_type.descr_wo_endian];
    if (mat_klass == null) {
        throw Error('Unsupported data type');
    }
    var data_view = new DataView(data, byteOffset + 10 + header_len);
    //b1 seems to have only 0/1, so no conversion needed
    var mat = new Matrix(data_type.shape, mat_klass);
    var mat_data = mat.getdataref();
    var view_accessor = view_accessor_map[data_type.descr_wo_endian];
    var view_bytestep = view_bytestep_map[data_type.descr_wo_endian];
    var numel = mat._numel;
    var view_little_endian = data_type.little_endian;
    if (data_type.fortran_order) {
        // sequentially copy
        for (var i = 0; i < numel; i++) {
            var val = view_accessor.call(data_view, view_bytestep * i, view_little_endian);
            mat_data[i] = val;
        }
    }
    else {
        //change order from c-order to fortran-order
        /*
        Size of matrix: (I, J, K)
        c-order strides: (J*K, K, 1)
        f-order strides: (1, I, I*J)
        when linear index in c-order is x:
        matrix index: (x / (J*K) % I * 1, x / K % J * I, x / 1 % K * I * J)
        that is: x / cstride[i] % size[i] * fstride[i] (i = 0,1,2)
        */
        var size = mat._size;
        var cstride = [];
        var fstride = [];
        var last_cstride = 1;
        var last_fstride = 1;
        for (var dim = 0; dim < size.length; dim++) {
            cstride.unshift(last_cstride);
            fstride.push(last_fstride);
            last_cstride *= size[size.length - 1 - dim];
            last_fstride *= size[dim];
        }
        for (var i = 0; i < numel; i++) {
            var val = view_accessor.call(data_view, view_bytestep * i, view_little_endian);
            var fidx = 0;
            for (var dim = 0; dim < size.length; dim++) {
                fidx += Math.floor(i / cstride[dim]) % size[dim] * fstride[dim];
            }
            mat_data[fidx] = val;
        }
    }
    return mat;
}
exports.npyread = npyread;
var save_klass_map = { 'logical': 'b1', 'uint8': 'u1', 'int32': 'i4', 'single': 'f4' };
var header_padding = '';
function npysave(A) {
    var klass = A._klass;
    var endian_char;
    switch (klass) {
        case 'logical':
        case 'uint8':
            endian_char = '|'; //not applicable
            break;
        default:
            endian_char = is_little_endian() ? '<' : '>';
            break;
    }
    var header_str = "{'descr': '" + endian_char + save_klass_map[klass] +
        "', 'fortran_order': True, 'shape': (" + A._size.join(', ') + "), }";
    //pad header_str to be (multiple of 16) - (magic 10 + last \n)
    var pad_len = 16 - (header_str.length + 11) % 16;
    header_str += '                '.substr(0, pad_len) + '\n';
    var header_len = header_str.length;
    var header_total_len = header_len + 10; //header with magic number
    var dst_size = A._numel * A._data_ctor.BYTES_PER_ELEMENT + header_total_len;
    var dst = new ArrayBuffer(dst_size);
    var dst_byte_offset = 0;
    var header_dst_view = new Uint8Array(dst, dst_byte_offset, header_total_len);
    var const_header = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00];
    for (var i = 0; i < const_header.length; i++) {
        header_dst_view[i] = const_header[i];
    }
    header_dst_view[8] = header_len % 256;
    header_dst_view[9] = Math.floor(header_len / 256);
    for (var i = 0; i < header_len; i++) {
        header_dst_view[10 + i] = header_str.charCodeAt(i);
    }
    var body_dst_view = new A._data_ctor(dst, dst_byte_offset + header_total_len, A._numel);
    body_dst_view.set(A.getdataref());
    return dst;
}
exports.npysave = npysave;

},{"../matrix":16}],16:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Colon = require('./colon');
var Matrix = (function () {
    function Matrix(size, klass, noalloc) {
        if (klass === void 0) { klass = 'single'; }
        if (noalloc === void 0) { noalloc = false; }
        var _size = Array.prototype.slice.call(size); //copy
        //verify size
        var tmpnumel = 1;
        var strides = [];
        var last_none_one_dim = 0;
        if (_size.length < 2) {
            throw new Error('matrix must have at least 2 dimensions');
        }
        for (var i = 0; i < _size.length; i++) {
            var dimsize = _size[i];
            if (typeof (dimsize) !== 'number' || dimsize < 0 || !Matrix._isinteger(dimsize)) {
                throw new Error('size is invalid');
            }
            if (dimsize != 1) {
                last_none_one_dim = i;
            }
            strides.push(tmpnumel);
            tmpnumel *= dimsize;
        }
        if (tmpnumel >= 2147483648) {
            // indexing with int32 value is impossible
            throw new Error('Matrix of equal to or more than 2G elements is not supported');
        }
        this._numel = tmpnumel;
        //remove tail dimensions with size 1 (retain minimum 2 dimensions)
        last_none_one_dim = Math.max(last_none_one_dim, 1) + 1;
        _size.splice(last_none_one_dim);
        strides.splice(last_none_one_dim);
        this._size = _size;
        this._ndims = _size.length;
        this._strides = strides;
        if (!Matrix._isvalidklass(klass)) {
            throw new Error('unknown klass');
        }
        this._klass = klass;
        this._data_ctor = Matrix.data_ctors[klass];
        if (!noalloc) {
            this._alloccpu();
        }
        if (Matrix._autodestruct_stack_top) {
            Matrix._autodestruct_stack_top.push(this);
        }
    }
    Matrix.autodestruct_push = function () {
        var array = [];
        Matrix._autodestruct_stack_top = array;
        Matrix._autodestruct_stack.push(array);
    };
    Matrix.autodestruct_pop = function () {
        if (Matrix._autodestruct_stack_top) {
            //destruct all in current list
            //console.log('Autodestruct: ' + Matrix._autodestruct_stack_top.length + ' mats');
            for (var i = 0; i < Matrix._autodestruct_stack_top.length; i++) {
                Matrix._autodestruct_stack_top[i].destruct();
            }
            Matrix._autodestruct_stack.pop();
            Matrix._autodestruct_stack_top = Matrix._autodestruct_stack[Matrix._autodestruct_stack.length - 1];
        }
    };
    Matrix.prototype.destruct = function () {
        //release memory
        this._data = null;
    };
    Matrix.prototype.inspect = function (depth) {
        var shape_str = this._size.join('x');
        if (this._numel <= 100) {
            return 'Matrix ' + shape_str + ' ' + this._klass + '\n' + this.toString();
        }
        else {
            return 'Matrix ' + shape_str + ' ' + this._klass;
        }
    };
    Matrix.typedarray2mat = function (size, klass, data) {
        if (klass === void 0) { klass = 'single'; }
        //type check
        if (!(data instanceof Matrix.data_ctors[klass])) {
            throw Error('klass and data type mismatch');
        }
        var m = new Matrix(size, klass, true);
        if (data.length < m._numel) {
            throw Error('The length of data is smaller than matrix size');
        }
        m._data = data;
        if (klass === 'logical') {
            //force values to 0/1
            for (var i = 0; i < m._numel; i++) {
                data[i] = Number(data[i] != 0);
            }
        }
        return m;
    };
    Matrix._isinteger = function (x) {
        return Math.round(x) == x;
    };
    Matrix._isvalidklass = function (klass) {
        return klass == 'single' || klass == 'int32' || klass == 'uint8' || klass == 'logical';
    };
    Matrix._logical_cast_required = function (klass_dst, klass_src) {
        return (klass_dst == 'logical' && klass_src != 'logical');
    };
    Matrix._logical_cast = function (val) {
        return Number(Boolean(val));
    };
    Matrix.prototype._alloccpu = function () {
        // allocate cpu buffer if not exist
        if (!this._data) {
            this._data = new this._data_ctor(this._numel);
        }
        return this._data;
    };
    Matrix.prototype.to_cpu = function () {
        return this;
    };
    Matrix.prototype._getdata = function () {
        //override in gpu
        //get copy of data in TypedArray
        return this._data;
    };
    Matrix.prototype.getdataref = function (src_offset, length) {
        if (src_offset === void 0) { src_offset = 0; }
        //get read-only view of array
        if (!src_offset && length == null) {
            return this._data;
        }
        else {
            if (length == null) {
                length = this._numel;
            }
            return new this._data_ctor(this._data.buffer, src_offset * this._data.BYTES_PER_ELEMENT, length);
        }
    };
    Matrix.prototype.getdatacopy = function (src_offset, length, dst) {
        if (src_offset === void 0) { src_offset = 0; }
        if (length == null) {
            length = this._numel - src_offset;
        }
        if (!dst) {
            dst = new this._data_ctor(length);
        }
        var range_view = new this._data_ctor(this._data.buffer, src_offset * this._data.BYTES_PER_ELEMENT, length);
        dst.set(range_view);
        return dst;
    };
    Matrix.prototype.setdata = function (src, dst_offset) {
        if (dst_offset === void 0) { dst_offset = 0; }
        //set raw data into buffer
        this._data.set(src, dst_offset);
    };
    Matrix.prototype._isvalidindex = function (inds) {
        if (this._numel == 0) {
            // if matrix have zero dimension, all index is invalid
            return false;
        }
        if (inds.length == 0) {
            return false;
        }
        else if (inds.length == 1) {
            return Matrix._isinteger(inds[0]) && ((inds[0] > 0 && inds[0] <= this._numel) || (inds[0] < 0 && (-inds[0]) <= this._numel));
        }
        else {
            if (inds.length < this._ndims) {
                // last index last index is regarded as linear index of remaining dimensions
                for (var dim = 0; dim < inds.length; dim++) {
                    var ind = inds[dim];
                    var dimsize;
                    if (dim == inds.length - 1) {
                        //last index
                        dimsize = 1;
                        for (var dimex = dim; dimex < this._ndims; dimex++) {
                            dimsize *= this._size[dimex];
                        }
                    }
                    else {
                        dimsize = this._size[dim];
                    }
                    if (Matrix._isinteger(ind) && ((ind > 0 && (ind <= dimsize) || (ind < 0 && -ind <= dimsize)))) {
                    }
                    else {
                        return false;
                    }
                }
            }
            else {
                for (var dim = 0; dim < inds.length; dim++) {
                    var ind = inds[dim];
                    var dimsize = this._size[dim] || 1;
                    // if dimensions of inds is more than matrix dimensions, only 1 is ok for the extra dimension
                    if (Matrix._isinteger(ind) && ((ind > 0 && (ind <= dimsize) || (ind < 0 && -ind <= dimsize)))) {
                    }
                    else {
                        return false;
                    }
                }
            }
        }
        return true;
    };
    Matrix.prototype._isvalidindexerr = function (inds) {
        if (!this._isvalidindex(inds)) {
            throw new Error('Invalid index');
        }
    };
    Matrix.prototype._getarrayindex = function (inds) {
        // assume inds is valid
        var idx = 0;
        if (inds.length == 1) {
            var ind = inds[0];
            if (ind < 0) {
                ind += this._numel + 1;
            }
            idx = ind - 1;
        }
        else {
            if (inds.length < this._ndims) {
                // last index last index is regarded as linear index of remaining dimensions
                for (var dim = 0; dim < inds.length; dim++) {
                    var ind = inds[dim];
                    if (ind < 0) {
                        var dimsize;
                        if (dim == inds.length - 1) {
                            //last index
                            dimsize = 1;
                            for (var dimex = dim; dimex < this._ndims; dimex++) {
                                dimsize *= this._size[dimex];
                            }
                        }
                        else {
                            dimsize = this._size[dim];
                        }
                        ind += dimsize + 1;
                    }
                    idx += (ind - 1) * (this._strides[dim] || 0); //trailing 1 does not affect
                }
            }
            else {
                for (var dim = 0; dim < inds.length; dim++) {
                    var ind = inds[dim];
                    if (ind < 0) {
                        ind += (this._size[dim] || 1) + 1;
                    }
                    idx += (ind - 1) * (this._strides[dim] || 0); //trailing 1 does not affect
                }
            }
        }
        return idx;
    };
    Matrix.numel = function (A) {
        return A._numel;
    };
    Matrix.size = function (X, dim) {
        if (dim == undefined) {
            return Matrix.jsa2mat([X._size]);
        }
        else {
            return X._size[dim - 1];
        }
    };
    Matrix.sizejsa = function (X) {
        return X._size;
    };
    Matrix.jsa2mat = function (ary, one_d_column, klass) {
        if (one_d_column === void 0) { one_d_column = false; }
        if (klass === void 0) { klass = 'single'; }
        // TODO: type inference (contains non-integer => single, contains boolean => logical)
        // get dimension
        var mat;
        if (typeof (ary) === 'number') {
            //1x1 matrix
            mat = new Matrix([1, 1], klass);
            mat.set_scalar(ary, [1]);
        }
        else if (ary instanceof Matrix) {
            //simply copy
            mat = ary.copy();
        }
        else if (!ary.length) {
            //0x0 matrix (length is undefined or 0)
            mat = new Matrix([0, 0], klass);
        }
        else {
            //n-d matrix
            //get shape
            var size = [];
            var cur_ary = ary;
            var numel = 1;
            while (cur_ary.length !== void 0) {
                size.push(cur_ary.length);
                numel *= cur_ary.length;
                cur_ary = cur_ary[0];
            }
            var ndims = size.length;
            var cstride = [];
            var fstride = [];
            var last_cstride = 1;
            var last_fstride = 1;
            for (var dim = 0; dim < size.length; dim++) {
                cstride.unshift(last_cstride);
                fstride.push(last_fstride);
                last_cstride *= size[size.length - 1 - dim];
                last_fstride *= size[dim];
            }
            //flatten data
            var data_ctor = Matrix.data_ctors[klass];
            var data = new data_ctor(numel);
            var flat_i = 0;
            var n = function (a, dim, fidx_ofs) {
                if (a.length != size[dim]) {
                    throw Error('Inconsistent size of n-d array');
                }
                if (dim == ndims - 1) {
                    // a contains numbers
                    for (var i = 0; i < size[dim]; i++) {
                        var val = a[i];
                        var fidx = fidx_ofs + Math.floor(flat_i / cstride[dim]) % size[dim] * fstride[dim];
                        data[fidx] = val;
                        flat_i++;
                    }
                }
                else {
                    for (var i = 0; i < size[dim]; i++) {
                        n(a[i], dim + 1, fidx_ofs + Math.floor(flat_i / cstride[dim]) % size[dim] * fstride[dim]);
                    }
                }
            };
            n(ary, 0, 0);
            if (ndims == 1) {
                if (one_d_column) {
                    size = [size[0], 1];
                }
                else {
                    size = [1, size[0]];
                }
            }
            mat = Matrix.typedarray2mat(size, klass, data);
        }
        return mat;
    };
    Matrix.prototype.mat2jsa = function (one_d_flatten) {
        if (one_d_flatten === void 0) { one_d_flatten = false; }
        //empty matrix will be [] not [[]]
        var ary = [];
        if (one_d_flatten && this._ndims == 2 && (this._size[0] == 1 || this._size[1] == 1)) {
            var data = this.getdataref();
            for (var i = 0; i < data.length; i++) {
                ary.push(data[i]);
            }
        }
        else {
            //n-d jagged array
            var size = this._size;
            var ndims = this._ndims;
            var data = this.getdataref();
            var cstride = [];
            var fstride = [];
            var last_cstride = 1;
            var last_fstride = 1;
            for (var dim = 0; dim < ndims; dim++) {
                cstride.unshift(last_cstride);
                fstride.push(last_fstride);
                last_cstride *= size[ndims - 1 - dim];
                last_fstride *= size[dim];
            }
            var flat_i = 0; //c-order
            var n = function (a, dim, fidx_ofs) {
                if (dim == ndims - 1) {
                    for (var i = 0; i < size[dim]; i++) {
                        var fidx = fidx_ofs + Math.floor(flat_i / cstride[dim]) % size[dim] * fstride[dim];
                        a.push(data[fidx]);
                        flat_i++;
                    }
                }
                else {
                    for (var i = 0; i < size[dim]; i++) {
                        var newa = [];
                        a.push(newa);
                        n(newa, dim + 1, fidx_ofs + Math.floor(flat_i / cstride[dim]) % size[dim] * fstride[dim]);
                    }
                }
            };
            n(ary, 0, 0);
        }
        return ary;
    };
    Matrix.prototype.get = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (this._numel == 0) {
            throw Error('Matrix with no element');
        }
        if (args.length == 0) {
            // get scalar
            return this._alloccpu()[0];
        }
        var all_number = args.every(function (v) { return typeof (v) === 'number'; });
        if (all_number) {
            return this.get_scalar(args);
        }
        else {
            return this.get_matrix_nd(args);
        }
    };
    // returns value of (1,1) or 0
    Matrix.prototype.valueOf = function () {
        if (this._numel > 0) {
            return this.get();
        }
        else {
            return 0;
        }
    };
    Matrix.prototype.copy = function (klass) {
        var clone = new Matrix(this._size, klass || this._klass);
        var clone_data = clone._getdata();
        var rawdata = this._alloccpu();
        if (Matrix._logical_cast_required(clone._klass, this._klass)) {
            for (var i = 0, length = clone_data.length; i < length; i++) {
                clone_data[i] = Matrix._logical_cast(rawdata[i]);
            }
        }
        else {
            clone_data.set(rawdata);
        }
        return clone;
    };
    Matrix.prototype.get_scalar = function (inds) {
        var rawdata = this._alloccpu();
        this._isvalidindexerr(inds);
        var arrayidx = this._getarrayindex(inds);
        return rawdata[arrayidx];
    };
    Matrix._get_ind_iterator = function (ind, dim_size) {
        // argument index is 0-origin
        // return index within valid range
        if (typeof (ind) === 'number') {
            var ind_positive = ind;
            if (ind_positive < 0) {
                ind_positive += dim_size + 1;
            }
            if (ind_positive <= 0 || ind_positive > dim_size) {
                throw Error('Index exceeds matrix dimension');
            }
            return {
                iter: function (index) {
                    return ind_positive;
                }, length: 1
            };
        }
        else if (ind instanceof Colon) {
            var start = ind.start;
            var stop = ind.stop;
            var step = ind.step;
            if (ind.all) {
                start = 1;
                stop = dim_size;
                step = 1;
            }
            if (start < 0) {
                start += dim_size + 1;
            }
            if (stop < 0) {
                stop += dim_size + 1;
            }
            var length = 0;
            if ((step > 0 && stop >= start) || (step < 0 && stop <= start)) {
                length = Math.floor((stop - start) / step) + 1;
                // check if in valid range
                var final_value = start + step * (length - 1);
                if ((start <= 0 || start > dim_size) || (final_value <= 0 || final_value > dim_size)) {
                    throw Error('Index exceeds matrix dimension');
                }
            }
            return {
                iter: function (index) {
                    return start + step * index;
                },
                length: length
            };
        }
        else if (ind instanceof Matrix) {
            var dataref = ind.getdataref();
            // check if in valid range
            for (var i = 0; i < dataref.length; i++) {
                var element = dataref[i];
                if (element == 0 || element > dim_size || element < -dim_size) {
                    throw Error('Index exceeds matrix dimension');
                }
            }
            return {
                iter: function (index) {
                    var val = dataref[index];
                    if (val < 0) {
                        val += dim_size;
                    }
                    return val;
                },
                length: dataref.length
            };
        }
    };
    Matrix.prototype.get_matrix_nd = function (inds) {
        var inds_ndim = inds.length;
        // replace logical matrix with vector
        for (var i = 0; i < inds_ndim; i++) {
            var ind = inds[i];
            if (ind instanceof Matrix) {
                if (ind._klass == 'logical') {
                    inds[i] = ind._find();
                }
            }
        }
        var virtual_input_shape = [];
        if (this._ndims <= inds_ndim) {
            // pad with 1
            virtual_input_shape = this._size.concat();
            while (virtual_input_shape.length < inds_ndim) {
                virtual_input_shape.push(1);
            }
        }
        else {
            // last dimension is like linear index
            var cur_prod = 1;
            for (var dim_1 = 0; dim_1 < inds_ndim - 1; dim_1++) {
                virtual_input_shape.push(this._size[dim_1]);
                cur_prod *= this._size[dim_1];
            }
            virtual_input_shape.push(this._numel / cur_prod);
        }
        var virtual_input_stride = [];
        var stride_tmp = 1;
        for (var dim = 0; dim < inds_ndim; dim++) {
            virtual_input_stride.push(stride_tmp);
            stride_tmp *= virtual_input_shape[dim];
        }
        var ind_iters = [];
        var dst_shape = [];
        var dst_stride = []; //not use dst._strides because tailing 1 dimension is omitted
        var dst_stride_tmp = 1;
        for (var dim = 0; dim < inds_ndim; dim++) {
            var iter_and_length = Matrix._get_ind_iterator(inds[dim], virtual_input_shape[dim]);
            ind_iters.push(iter_and_length.iter);
            dst_shape.push(iter_and_length.length);
            dst_stride.push(dst_stride_tmp);
            dst_stride_tmp *= iter_and_length.length;
        }
        var dst_reshape_shape = null;
        if (inds_ndim == 1) {
            // linear indexing case
            dst_shape.push(1); //avoid error on new Matrix()
            // if ind is logical matrix, regarded as vector in the following
            // colon is row vector
            // src and ind are both vectors => follows direction of src
            // otherwise: follows ind's shape
            var is_ind_vector = false;
            var only_ind = inds[0];
            if (only_ind instanceof Matrix) {
                if (only_ind._ndims == 2 && (only_ind._size[0] == 1 || only_ind._size[1] == 1)) {
                    is_ind_vector = true;
                }
            }
            else if (only_ind instanceof Colon) {
                is_ind_vector = true;
            }
            var is_src_vector = false;
            if (this._ndims == 2 && (this._size[0] == 1 || this._size[1] == 1)) {
                is_src_vector = true;
            }
            if (is_src_vector && is_ind_vector) {
                // follow direction of src
                if (this._size[0] == 1) {
                    // reshape to row vector
                    dst_reshape_shape = [1, dst_shape[0]];
                }
            }
            else {
                // follow ind's shape
                if (only_ind instanceof Matrix) {
                    dst_reshape_shape = only_ind._size;
                }
                else if (only_ind instanceof Colon) {
                    // reshape to row vector
                    dst_reshape_shape = [1, dst_shape[0]];
                }
            }
        }
        var dst = new Matrix(dst_shape, this._klass);
        var dst_data = dst._data;
        var src_data = this._data;
        var dst_numel = dst._numel;
        for (var dst_idx = 0; dst_idx < dst_numel; dst_idx++) {
            var input_linear_idx = 0;
            for (var dim = 0; dim < inds_ndim; dim++) {
                var dst_coord = Math.floor(dst_idx / dst_stride[dim]) % dst_shape[dim];
                var src_coord = ind_iters[dim](dst_coord) - 1;
                input_linear_idx += src_coord * virtual_input_stride[dim];
            }
            dst_data[dst_idx] = src_data[input_linear_idx];
        }
        if (dst_reshape_shape) {
            dst.reshape_inplace(dst_reshape_shape);
        }
        return dst;
    };
    Matrix.prototype.get_matrix_nd_old = function (inds) {
        //multidim indexing
        //convert index of each dimension into array
        var eachdimidx = [];
        var eachdimstride = [];
        var output_size = [];
        var output_length = 1;
        var inputdimctr = [];
        for (var dim = 0; dim < inds.length; dim++) {
            var dimind = inds[dim];
            var dimidx;
            if (dimind instanceof Colon) {
                dimidx = dimind.tojsa(this._size[dim] === void 0 ? 1 : this._size[dim]);
            }
            else if (dimind instanceof Matrix) {
                dimidx = dimind._getdata();
            }
            else {
                //number
                dimidx = [dimind];
            }
            //range check
            var dimsize;
            if (dim == inds.length - 1) {
                // last index is regarded as linear index of remaining dimensions
                dimsize = 1;
                for (var dimex = dim; dimex < this._ndims; dimex++) {
                    dimsize *= this._size[dimex];
                }
            }
            else {
                dimsize = this._size[dim] || 1; //exceed dimension must be [1,1,...]
            }
            for (var i = 0; i < dimidx.length; i++) {
                var dimval = dimidx[i];
                if (dimval < 0) {
                    dimval += dimsize + 1;
                    dimidx[i] = dimval;
                }
                if ((dimval > dimsize) || (dimval < 1)) {
                    throw new Error('Index exceeds matrix dimension');
                }
            }
            eachdimidx.push(dimidx);
            eachdimstride.push(this._strides[dim] || 0);
            output_size.push(dimidx.length);
            output_length *= dimidx.length;
            inputdimctr.push(0);
        }
        var output = new Matrix(output_size, this._klass);
        var output_data = output._data;
        var input_data = this._data;
        for (var i = 0; i < output_length; i++) {
            //calc input index
            var input_raw_idx = 0;
            for (var dim = 0; dim < eachdimidx.length; dim++) {
                input_raw_idx += (eachdimidx[dim][inputdimctr[dim]] - 1) * eachdimstride[dim];
            }
            output_data[i] = input_data[input_raw_idx];
            //increment input index
            for (var dim = 0; dim < inputdimctr.length; dim++) {
                var element = ++inputdimctr[dim];
                if (element >= eachdimidx[dim].length) {
                    //overflow to next dimension
                    inputdimctr[dim] = 0;
                }
                else {
                    break;
                }
            }
        }
        return output;
    };
    Matrix.prototype.get_matrix_single = function (singleind) {
        var single_idx_array;
        var output_size;
        if (singleind instanceof Colon) {
            single_idx_array = singleind.tojsa(this._numel);
            output_size = [1, single_idx_array.length]; //row vector
        }
        else if (singleind instanceof Matrix) {
            // returns matrix of same shape
            // value in matrix is used as linear index
            single_idx_array = singleind._data;
            output_size = singleind._size;
        }
        var output = new Matrix(output_size, this._klass);
        var output_data = output._data;
        var input_data = this._data;
        for (var i = 0, length = single_idx_array.length; i < length; i++) {
            output_data[i] = input_data[single_idx_array[i] - 1];
        }
        return output;
    };
    Matrix.prototype.get_matrix_logical = function (map) {
        // equivalent to this.get(find(map))
        var output_length = 0;
        var map_data = map._getdata();
        var max_i = -1;
        for (var i = 0, length = map_data.length; i < length; i++) {
            if (map_data[i]) {
                output_length++;
                max_i = i;
            }
        }
        if (this._numel <= max_i) {
            throw new Error('Index out of bounds');
        }
        var output = new Matrix([output_length, 1], this._klass);
        var output_data = output._data;
        var input_data = this._data;
        var ptr = 0;
        for (var i = 0, length = map_data.length; i < length; i++) {
            if (map_data[i]) {
                output_data[ptr++] = input_data[i];
            }
        }
        return output;
    };
    Matrix.prototype.set = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        //last argument is value, but subsequent function requires first argument to be value
        var val = args.pop();
        if (!(val instanceof Matrix) && val.length !== void 0) {
            // js array (or array-like)
            val = Matrix.jsa2mat(val, false, this._klass);
        }
        // scalar matrix converted to number
        if (val instanceof Matrix && val._numel == 1) {
            val = val.get_scalar([1]);
        }
        var all_number = args.every(function (v) { return typeof (v) === 'number'; });
        if (all_number) {
            this.set_scalar(val, args);
        }
        else {
            this.set_matrix_nd(val, args);
        }
    };
    Matrix.prototype.set_scalar = function (val, inds) {
        var rawdata = this._alloccpu();
        this._isvalidindexerr(inds);
        var arrayidx = this._getarrayindex(inds);
        var scalar_val;
        if (val instanceof Matrix) {
            if (val._numel != 1) {
                throw new Error('Value is not scalar');
            }
            scalar_val = val._getdata()[0];
        }
        else {
            scalar_val = val;
        }
        if (Matrix._logical_cast_required(this._klass)) {
            scalar_val = Matrix._logical_cast(scalar_val);
        }
        rawdata[arrayidx] = scalar_val;
    };
    Matrix.prototype.set_matrix_single = function (val, singleind) {
        var single_idx_array;
        var output_size;
        if (singleind instanceof Colon) {
            single_idx_array = singleind.tojsa(this._numel);
        }
        else if (singleind instanceof Matrix) {
            // value in matrix is used as linear index
            // used as flattened value array, regardless of shape
            single_idx_array = singleind.getdataref();
        }
        var rawdata = this._alloccpu();
        if (val instanceof Matrix) {
            if (single_idx_array.length != val._numel) {
                throw new Error('Dimension mismatch');
            }
            var val_data = val._getdata();
            // read over flattened val
            if (Matrix._logical_cast_required(this._klass, val._klass)) {
                rawdata[single_idx_array[i] - 1] = Matrix._logical_cast(val_data[i]);
            }
            else {
                for (var i = 0, length = single_idx_array.length; i < length; i++) {
                    rawdata[single_idx_array[i] - 1] = val_data[i];
                }
            }
        }
        else {
            var scalar_val;
            if (Matrix._logical_cast_required(this._klass)) {
                scalar_val = Matrix._logical_cast(val);
            }
            else {
                scalar_val = val;
            }
            for (var i = 0, length = single_idx_array.length; i < length; i++) {
                rawdata[single_idx_array[i] - 1] = scalar_val;
            }
        }
    };
    Matrix.prototype.set_matrix_nd = function (val, inds) {
        var inds_ndim = inds.length;
        // replace logical matrix with vector
        for (var i = 0; i < inds_ndim; i++) {
            var ind = inds[i];
            if (ind instanceof Matrix) {
                if (ind._klass == 'logical') {
                    inds[i] = ind._find();
                }
            }
        }
        var virtual_input_shape = [];
        if (this._ndims <= inds_ndim) {
            // pad with 1
            virtual_input_shape = this._size.concat();
            while (virtual_input_shape.length < inds_ndim) {
                virtual_input_shape.push(1);
            }
        }
        else {
            // last dimension is like linear index
            var cur_prod = 1;
            for (var dim_2 = 0; dim_2 < inds_ndim - 1; dim_2++) {
                virtual_input_shape.push(this._size[dim_2]);
                cur_prod *= this._size[dim_2];
            }
            virtual_input_shape.push(this._numel / cur_prod);
        }
        var virtual_input_stride = [];
        var stride_tmp = 1;
        for (var dim = 0; dim < inds_ndim; dim++) {
            virtual_input_stride.push(stride_tmp);
            stride_tmp *= virtual_input_shape[dim];
        }
        var ind_iters = [];
        var dst_shape = [];
        var dst_stride = []; //not use dst._strides because tailing 1 dimension is omitted
        var dst_stride_tmp = 1;
        for (var dim = 0; dim < inds_ndim; dim++) {
            var iter_and_length = Matrix._get_ind_iterator(inds[dim], virtual_input_shape[dim]);
            ind_iters.push(iter_and_length.iter);
            dst_shape.push(iter_and_length.length);
            dst_stride.push(dst_stride_tmp);
            dst_stride_tmp *= iter_and_length.length;
        }
        var dst_numel = dst_stride_tmp;
        var scalar_val = null;
        if (typeof (val) === 'number') {
            scalar_val = val;
        }
        else if (val instanceof Matrix) {
            if (val._numel === 1) {
                scalar_val = val.valueOf();
            }
        }
        if (scalar_val == null) {
            // set matrix
            // shape check; dimensions excluding value 1 must match
            var dst_shape_exclude_one = dst_shape.filter(function (v) { return v != 1; });
            var val_shape_exclude_one = val._size.filter(function (v) { return v != 1; });
            if (dst_shape_exclude_one.length != val_shape_exclude_one.length) {
                throw Error('Shape mismatch');
            }
            if (!dst_shape_exclude_one.every(function (v, i) { return v == val_shape_exclude_one[i]; })) {
                throw Error('Shape mismatch');
            }
            var dst_data = val.getdataref();
            var src_data = this._data;
            for (var dst_idx = 0; dst_idx < dst_numel; dst_idx++) {
                var input_linear_idx = 0;
                for (var dim = 0; dim < inds_ndim; dim++) {
                    var dst_coord = Math.floor(dst_idx / dst_stride[dim]) % dst_shape[dim];
                    var src_coord = ind_iters[dim](dst_coord) - 1;
                    input_linear_idx += src_coord * virtual_input_stride[dim];
                }
                src_data[input_linear_idx] = dst_data[dst_idx];
            }
        }
        else {
            // set scalar
            var src_data = this._data;
            for (var dst_idx = 0; dst_idx < dst_numel; dst_idx++) {
                var input_linear_idx = 0;
                for (var dim = 0; dim < inds_ndim; dim++) {
                    var dst_coord = Math.floor(dst_idx / dst_stride[dim]) % dst_shape[dim];
                    var src_coord = ind_iters[dim](dst_coord) - 1;
                    input_linear_idx += src_coord * virtual_input_stride[dim];
                }
                src_data[input_linear_idx] = scalar_val;
            }
        }
    };
    Matrix.prototype.set_matrix_nd_old = function (val, inds) {
        //multidim indexing
        //convert index of each dimension into array
        var eachdimidx = [];
        var eachdimstride = [];
        var output_size = [];
        var output_length = 1;
        var inputdimctr = [];
        for (var dim = 0; dim < inds.length; dim++) {
            var dimind = inds[dim];
            var dimidx;
            if (dimind instanceof Colon) {
                dimidx = dimind.tojsa(this._size[dim] || 1);
            }
            else if (dimind instanceof Matrix) {
                dimidx = dimind._getdata();
            }
            else {
                //number
                dimidx = [dimind];
            }
            //range check
            var dim_size = this._size[dim] || 1; //exceed dimension must be [1,1,...]
            for (var i = 0; i < dimidx.length; i++) {
                if ((dimidx[i] > dim_size) || (dimidx[i] < 1)) {
                    throw new Error('Index exceeds matrix dimension');
                }
            }
            eachdimidx.push(dimidx);
            eachdimstride.push(this._strides[dim] || 0);
            output_size.push(dimidx.length);
            output_length *= dimidx.length;
            inputdimctr.push(0);
        }
        var rawdata = this._alloccpu();
        if (val instanceof Matrix) {
            //val shape check
            var is_vector = output_size.filter(function (v) { return v != 1; }).length <= 1;
            if (is_vector) {
                // if shape is vector, only numel have to match
                if (val._numel != output_length) {
                    throw new Error('Dimensions mismatch');
                }
            }
            else {
                // shape must match (exclude tailing 1)
                for (var dim = 0; dim < Math.max(val._size.length, output_size.length); dim++) {
                    if ((val._size[dim] || 1) != (output_size[dim] || 1)) {
                        throw new Error('Dimensions mismatch');
                    }
                }
            }
            var val_data = val._getdata();
            if (Matrix._logical_cast_required(this._klass, val._klass)) {
                for (var i = 0; i < output_length; i++) {
                    //calc input index
                    var input_raw_idx = 0;
                    for (var dim = 0; dim < eachdimidx.length; dim++) {
                        input_raw_idx += (eachdimidx[dim][inputdimctr[dim]] - 1) * eachdimstride[dim];
                    }
                    rawdata[input_raw_idx] = Matrix._logical_cast(val_data[i]);
                    //increment input index
                    for (var dim = 0; dim < inputdimctr.length; dim++) {
                        var element = ++inputdimctr[dim];
                        if (element >= eachdimidx[dim].length) {
                            //overflow to next dimension
                            inputdimctr[dim] = 0;
                        }
                        else {
                            break;
                        }
                    }
                }
            }
            else {
                for (var i = 0; i < output_length; i++) {
                    //calc input index
                    var input_raw_idx = 0;
                    for (var dim = 0; dim < eachdimidx.length; dim++) {
                        input_raw_idx += (eachdimidx[dim][inputdimctr[dim]] - 1) * eachdimstride[dim];
                    }
                    rawdata[input_raw_idx] = val_data[i];
                    //increment input index
                    for (var dim = 0; dim < inputdimctr.length; dim++) {
                        var element = ++inputdimctr[dim];
                        if (element >= eachdimidx[dim].length) {
                            //overflow to next dimension
                            inputdimctr[dim] = 0;
                        }
                        else {
                            break;
                        }
                    }
                }
            }
        }
        else {
            //val is scalar
            var scalar_val;
            if (Matrix._logical_cast_required(this._klass)) {
                scalar_val = Matrix._logical_cast(val);
            }
            else {
                scalar_val = val;
            }
            for (var i = 0; i < output_length; i++) {
                //calc input index
                var input_raw_idx = 0;
                for (var dim = 0; dim < eachdimidx.length; dim++) {
                    input_raw_idx += (eachdimidx[dim][inputdimctr[dim]] - 1) * eachdimstride[dim];
                }
                rawdata[input_raw_idx] = scalar_val;
                //increment input index
                for (var dim = 0; dim < inputdimctr.length; dim++) {
                    var element = ++inputdimctr[dim];
                    if (element >= eachdimidx[dim].length) {
                        //overflow to next dimension
                        inputdimctr[dim] = 0;
                    }
                    else {
                        break;
                    }
                }
            }
        }
    };
    Matrix.prototype.set_matrix_logical = function (val, map) {
        // equivalent to this.set(val, find(map))
        var output_length = 0;
        var map_data = map._getdata();
        var max_i = -1;
        for (var i = 0, length = map_data.length; i < length; i++) {
            if (map_data[i]) {
                output_length++;
                max_i = i;
            }
        }
        if (this._numel < max_i) {
            throw new Error('Index out of bounds');
        }
        var rawdata = this._alloccpu();
        if (val instanceof Matrix) {
            var val_data = val._getdata();
            var ptr = 0;
            if (Matrix._logical_cast_required(this._klass, val._klass)) {
                for (var i = 0, length = map_data.length; i < length; i++) {
                    if (map_data[i]) {
                        rawdata[i] = Matrix._logical_cast(val_data[ptr++]);
                    }
                }
            }
            else {
                for (var i = 0, length = map_data.length; i < length; i++) {
                    if (map_data[i]) {
                        rawdata[i] = val_data[ptr++];
                    }
                }
            }
        }
        else {
            var ptr = 0;
            var scalar_val;
            if (Matrix._logical_cast_required(this._klass)) {
                scalar_val = Matrix._logical_cast(val);
            }
            else {
                scalar_val = val;
            }
            for (var i = 0, length = map_data.length; i < length; i++) {
                if (map_data[i]) {
                    rawdata[i] = scalar_val;
                }
            }
        }
    };
    Matrix.prototype.toString = function () {
        var s = '';
        var rows = this._size[0], cols = this._size[1];
        var rawdata = this.getdataref();
        for (var row = 0; row < rows; row++) {
            for (var col = 0; col < cols; col++) {
                s += rawdata[col * rows + row] + '\t';
            }
            s += '\n';
        }
        return s;
    };
    Matrix.prototype.disp = function (X) {
        var s = '';
        if (this !== void 0) {
            s = this.toString();
        }
        else {
            s = X.toString();
        }
        console.log(s);
    };
    Matrix.prototype.reshape_inplace = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        var _size;
        var first_arg = args[0];
        //convert to Array
        if (first_arg instanceof Matrix) {
            var tarray = first_arg._getdata();
            _size = Array.prototype.slice.call(tarray);
        }
        else if (first_arg.length !== void 0) {
            _size = Array.prototype.slice.call(first_arg);
        }
        else {
            _size = Array.prototype.slice.call(args);
        }
        //type check
        var tmpnumel = 1;
        var strides = [];
        var last_none_one_dim = 0;
        if (_size.length < 2) {
            throw new Error('matrix must have at least 2 dimensions');
        }
        //substitute -1 to remaining value
        var minus_pos = -1;
        var remaining_prod = 1;
        for (var i = 0; i < _size.length; i++) {
            if (_size[i] < 0) {
                if (minus_pos >= 0) {
                    throw new Error('Only one free size is accepted');
                }
                minus_pos = i;
            }
            else {
                remaining_prod *= _size[i];
            }
        }
        if (minus_pos >= 0) {
            _size[minus_pos] = this._numel / remaining_prod;
        }
        for (var i = 0; i < _size.length; i++) {
            var dimsize = _size[i];
            if (typeof (dimsize) !== 'number' || dimsize < 0 || !Matrix._isinteger(dimsize)) {
                throw new Error('size is invalid');
            }
            if (dimsize != 1) {
                last_none_one_dim = i;
            }
            strides.push(tmpnumel);
            tmpnumel *= dimsize;
        }
        if (tmpnumel !== this._numel) {
            throw new Error('New shape must have same elements');
        }
        //remove tail dimensions with size 1 (retain minimum 2 dimensions)
        last_none_one_dim = Math.max(last_none_one_dim, 1) + 1;
        _size.splice(last_none_one_dim);
        strides.splice(last_none_one_dim);
        this._size = _size;
        this._numel = tmpnumel;
        this._ndims = _size.length;
        this._strides = strides;
    };
    Matrix.prototype.squeeze_inplace = function () {
        if (this._ndims == 2) {
            // keep [1,5] remained
            return;
        }
        var new_size = this._size.filter(function (v) { return v !== 1; });
        //append 1 to tail
        while (new_size.length < 2) {
            new_size.push(1);
        }
        var tmpnumel = 1;
        var strides = [];
        for (var dim = 0; dim < new_size.length; dim++) {
            var dimsize = new_size[dim];
            strides.push(tmpnumel);
            tmpnumel *= dimsize;
        }
        this._size = new_size;
        this._ndims = new_size.length;
        this._strides = strides;
    };
    Matrix.prototype._find = function () {
        // returns nonzero-element indices
        // if this is vector, direction (row/col) is kept.
        // otherwise, column vector is returned.
        var output_length = 0;
        var src_data = this.getdataref();
        for (var i = 0; i < src_data.length; i++) {
            if (src_data[i]) {
                output_length++;
            }
        }
        var dst = new Matrix([output_length, 1], 'int32');
        var dst_idx = 0;
        var dst_data = dst._data;
        for (var i = 0; dst_idx < output_length; i++) {
            if (src_data[i]) {
                dst_data[dst_idx++] = i + 1;
            }
        }
        if (this._size[1] == this._numel) {
            // row vector
            dst.reshape_inplace(this._size);
        }
        return dst;
    };
    Matrix._autodestruct_stack = [];
    Matrix._autodestruct_stack_top = null;
    Matrix.data_ctors = { 'single': Float32Array, 'int32': Int32Array, 'uint8': Uint8Array, 'logical': Uint8Array };
    return Matrix;
}());
module.exports = Matrix;

},{"./colon":12}],17:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Matrix = require('./matrix');
function mtimes(A, B) {
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
exports.mtimes = mtimes;

},{"./matrix":16}],18:[function(require,module,exports){
// does polyfill for older browsers
"use strict";
function polyfill() {
    typedarray_fill_all();
}
exports.polyfill = polyfill;
function typedarray_fill_all() {
    typedarray_fill(Int8Array);
    typedarray_fill(Uint8Array);
    typedarray_fill(Uint8ClampedArray);
    typedarray_fill(Int16Array);
    typedarray_fill(Uint16Array);
    typedarray_fill(Int32Array);
    typedarray_fill(Uint32Array);
    typedarray_fill(Float32Array);
    typedarray_fill(Float64Array);
}
function typedarray_fill(type) {
    // https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Array/fill#Polyfill
    if (!type.prototype.fill) {
        type.prototype.fill = function (value) {
            // Steps 1-2.
            if (this == null) {
                throw new TypeError('this is null or not defined');
            }
            var O = Object(this);
            // Steps 3-5.
            var len = O.length >>> 0;
            // Steps 6-7.
            var start = arguments[1];
            var relativeStart = start >> 0;
            // Step 8.
            var k = relativeStart < 0 ?
                Math.max(len + relativeStart, 0) :
                Math.min(relativeStart, len);
            // Steps 9-10.
            var end = arguments[2];
            var relativeEnd = end === undefined ?
                len : end >> 0;
            // Step 11.
            var final = relativeEnd < 0 ?
                Math.max(len + relativeEnd, 0) :
                Math.min(relativeEnd, len);
            // Step 12.
            while (k < final) {
                O[k] = value;
                k++;
            }
            // Step 13.
            return O;
        };
    }
}

},{}],19:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Matrix = require('./matrix');
var util = require('./util');
var func_generator = require('./func_generator');
function max_along_axis_old(A, dim) {
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
        var dst_onlyreshape = A.copy();
        dst_onlyreshape.reshape_inplace(dstsize);
        return dst_onlyreshape;
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
    for (var dst_idx = 0, dst_numel = dst._numel; dst_idx < dst_numel; dst_idx++) {
        var src_idx = 0;
        for (var d = 0; d < dims; d++) {
            src_idx += Math.floor(dst_idx % output_strides[d + 1] / output_strides[d]) * input_strides[d];
        }
        var val = a_data[src_idx];
        var curret = val;
        for (var red = 1; red < reduction_count; red++) {
            src_idx += reduction_step;
            val = a_data[src_idx];
            if (val > curret) {
                curret = val;
            }
        }
        dst_data[dst_idx] = curret;
    }
    return dst;
}
function _argmax_ones_like(A) {
    var amax = new Matrix(A._size, 'int32');
    amax._data.fill(1);
    return { M: A, I: amax };
}
function make_reduction_along_axis(var_decl, var_update, result_assign, out_argmax) {
    var f;
    eval([
        "f = function(A, dim) {",
        "    if (dim == null) {",
        "        //select first non-1 axis",
        "        dim = A._numel;",
        "        for (var i = 0; i < A._size.length; i++) {",
        "            var dimsize = A._size[i];",
        "            if (dimsize !== 1) {",
        "                dim = i + 1;",
        "                break;",
        "            }",
        "        }",
        "    }",
        "    if (dim > A._ndims) {",
        "        //max along axis with size 1",
        out_argmax ? "return _argmax_ones_like(A.copy());" : "return A.copy();",
        "    }",
        "    var dstsize = A._size.slice();",
        "    if (dstsize[dim - 1] !== 0) {",
        "        //size 0 dimension is preserved",
        "        dstsize[dim - 1] = 1;",
        "    }",
        "    if (A._numel === 0) {",
        "        //only change shape",
        "        var dst_onlyreshape = A.copy();",
        "        dst_onlyreshape.reshape_inplace(dstsize);",
        out_argmax ? "return _argmax_ones_like(dst_onlyreshape);" : "return dst_onlyreshape;",
        "    }",
        "    //reduction actually needed",
        "    var dst = new Matrix(dstsize, A._klass);",
        out_argmax ? "var amax = new Matrix(dstsize, 'int32'); var amax_data = amax._data;" : "",
        "    var input_strides = A._strides;",
        "    var output_strides = dst._strides.slice();",
        "    while (output_strides.length <= input_strides.length) {",
        "        output_strides.push(dst._numel);",
        "    }",
        "    var reduction_step = input_strides[dim - 1];",
        "    var reduction_count = A._size[dim - 1];",
        "    var a_data = A._data;",
        "    var dst_data = dst._data;",
        "    var dims = A._ndims;",
        "    for (var dst_idx = 0, dst_numel = dst._numel; dst_idx < dst_numel; dst_idx++) {",
        "        var src_idx = 0;",
        "        for (var d = 0; d < dims; d++) {",
        "            src_idx += Math.floor(dst_idx % output_strides[d + 1] / output_strides[d]) * input_strides[d];",
        "        }",
        "        var val = a_data[src_idx];",
        //"        var curret = val;",
        var_decl,
        "        for (var red = 1; red < reduction_count; red++) {",
        "            src_idx += reduction_step;",
        "            val = a_data[src_idx];",
        //"            if (val > curret) {",
        //"                curret = val;",
        //"            }",
        var_update,
        "        }",
        //"        dst_data[dst_idx] = curret;",
        result_assign,
        "    }",
        out_argmax ? "return {M:dst,I:amax};" : "return dst;",
        "}",].join('\n'));
    return f;
}
function make_reduction_along_axis_stat(var_decl, var_update, result_assign) {
    var f;
    eval([
        "f = function(A, dim) {",
        "    if (dim == null) {",
        "        //select first non-1 axis",
        "        dim = A._numel;",
        "        for (var i = 0; i < A._size.length; i++) {",
        "            var dimsize = A._size[i];",
        "            if (dimsize !== 1) {",
        "                dim = i + 1;",
        "                break;",
        "            }",
        "        }",
        "    }",
        "    if (dim > A._ndims) {",
        "        //max along axis with size 1",
        "    }",
        "    var dstsize = A._size.slice();",
        "    if (dstsize[dim - 1] !== 0) {",
        "        //size 0 dimension is preserved",
        "        dstsize[dim - 1] = 1;",
        "    }",
        "    if (A._numel === 0) {",
        "        //only change shape",
        "        var dst_onlyreshape = A.copy();",
        "        dst_onlyreshape.reshape_inplace(dstsize);",
        "        return dst_onlyreshape;",
        "    }",
        "    //reduction actually needed",
        "    var dst = new Matrix(dstsize, 'single');",
        "    var input_strides = A._strides;",
        "    var output_strides = dst._strides.slice();",
        "    while (output_strides.length <= input_strides.length) {",
        "        output_strides.push(dst._numel);",
        "    }",
        "    var reduction_step = input_strides[dim - 1];",
        "    var reduction_count = A._size[dim - 1];",
        "    var a_data = A._data;",
        "    var dst_data = dst._data;",
        "    var dims = A._ndims;",
        "    for (var dst_idx = 0, dst_numel = dst._numel; dst_idx < dst_numel; dst_idx++) {",
        "        var src_idx = 0;",
        "        for (var d = 0; d < dims; d++) {",
        "            src_idx += Math.floor(dst_idx % output_strides[d + 1] / output_strides[d]) * input_strides[d];",
        "        }",
        "        var val = a_data[src_idx];",
        //"        var curret = val;",
        var_decl,
        "        for (var red = 1; red < reduction_count; red++) {",
        "            src_idx += reduction_step;",
        "            val = a_data[src_idx];",
        //"            if (val > curret) {",
        //"                curret = val;",
        //"            }",
        var_update,
        "        }",
        //"        dst_data[dst_idx] = curret;",
        result_assign,
        "    }",
        "return dst;",
        "}",].join('\n'));
    return f;
}
var max_along_axis = make_reduction_along_axis('var curret = val;', 'if(val>curret){curret=val;}', 'dst_data[dst_idx]=curret;', false);
var max_elementwise = func_generator.make_binary_arith_func_all('Math.max(%a,%b)');
var min_along_axis = make_reduction_along_axis('var curret = val;', 'if(val<curret){curret=val;}', 'dst_data[dst_idx]=curret;', false);
var min_elementwise = func_generator.make_binary_arith_func_all('Math.min(%a,%b)');
function max(A, B, dim) {
    if (B == null) {
        //max along axis
        return max_along_axis(util.as_mat(A), dim);
    }
    else {
        //elementwise max
        return max_elementwise(A, B);
    }
}
exports.max = max;
function min(A, B, dim) {
    if (B == null) {
        return min_along_axis(util.as_mat(A), dim);
    }
    else {
        return min_elementwise(A, B);
    }
}
exports.min = min;
var argmax_along_axis = make_reduction_along_axis('var curret = val, curamax = 0;', 'if(val>curret){curret=val;curamax=red;}', 'dst_data[dst_idx]=curret; amax_data[dst_idx]=curamax+1;', true);
function argmax(A, dummy, dim) {
    return argmax_along_axis(util.as_mat(A), dim);
}
exports.argmax = argmax;
var argmin_along_axis = make_reduction_along_axis('var curret = val, curamax = 0;', 'if(val<curret){curret=val;curamax=red;}', 'dst_data[dst_idx]=curret; amax_data[dst_idx]=curamax+1;', true);
function argmin(A, dummy, dim) {
    return argmin_along_axis(util.as_mat(A), dim);
}
exports.argmin = argmin;
function sum_mean(A, args, f) {
    var dim = undefined;
    var outtype = undefined;
    while (args.length > 0) {
        var arg = args.pop();
        if (typeof (arg) === 'string') {
            if (arg != 'native') {
                throw new Error('Outtype other than native is currently not supported');
            }
        }
        else if (typeof (arg) === 'number') {
            dim = arg;
        }
        else {
            throw new Error('Unknown argument ' + arg);
        }
    }
    return f(A, dim);
}
var sum_along_axis = make_reduction_along_axis_stat('var curret = val;', 'curret += val;', 'dst_data[dst_idx] = curret;');
function sum(A) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    return sum_mean(A, args, sum_along_axis);
}
exports.sum = sum;
var mean_along_axis = make_reduction_along_axis_stat('var curret = val;', 'curret += val;', 'dst_data[dst_idx] = curret / reduction_count;');
function mean(A) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    return sum_mean(A, args, mean_along_axis);
}
exports.mean = mean;
var prod_along_axis = make_reduction_along_axis_stat('var curret = val;', 'curret *= val;', 'dst_data[dst_idx] = curret;');
function prod(A) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    return sum_mean(A, args, prod_along_axis);
}
exports.prod = prod;
//w=0: normalize by N-1
var variance_along_axis_w0 = make_reduction_along_axis_stat('var normalsum = val; var sqsum = val * val;', 'normalsum += val; sqsum += val * val;', 'dst_data[dst_idx] = (sqsum - normalsum * normalsum / reduction_count) / Math.max(reduction_count - 1, 1);');
//w=1: normalize by N
var variance_along_axis_w1 = make_reduction_along_axis_stat('var normalsum = val; var sqsum = val * val;', 'normalsum += val; sqsum += val * val;', 'dst_data[dst_idx] = (sqsum - normalsum * normalsum / reduction_count) / reduction_count;');
function variance(A, w, dim) {
    if (w === void 0) { w = 0; }
    if (w == 0) {
        return variance_along_axis_w0(A, dim);
    }
    else if (w == 1) {
        return variance_along_axis_w1(A, dim);
    }
    else {
        throw new Error('w must be 0 or 1');
    }
}
exports.variance = variance;
//w=0: normalize by N-1
var std_along_axis_w0 = make_reduction_along_axis_stat('var normalsum = val; var sqsum = val * val;', 'normalsum += val; sqsum += val * val;', 'dst_data[dst_idx] = Math.sqrt((sqsum - normalsum * normalsum / reduction_count) / Math.max(reduction_count - 1, 1));');
//w=1: normalize by N
var std_along_axis_w1 = make_reduction_along_axis_stat('var normalsum = val; var sqsum = val * val;', 'normalsum += val; sqsum += val * val;', 'dst_data[dst_idx] = Math.sqrt((sqsum - normalsum * normalsum / reduction_count) / reduction_count);');
function std(A, w, dim) {
    if (w === void 0) { w = 0; }
    if (w == 0) {
        return std_along_axis_w0(A, dim);
    }
    else if (w == 1) {
        return std_along_axis_w1(A, dim);
    }
    else {
        throw new Error('w must be 0 or 1');
    }
}
exports.std = std;

},{"./func_generator":14,"./matrix":16,"./util":22}],20:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Matrix = require('./matrix');
var colon = require('./colonwrap');
function transpose(A) {
    if (A._ndims != 2) {
        throw new Error('Matrix must be two-dimensional');
    }
    A = A.to_cpu();
    var _a = A._size, dst_cols = _a[0], dst_rows = _a[1];
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
exports.transpose = transpose;
function repmat(A) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    A = A.to_cpu();
    //convert to Array
    var _rs; //number of repetion for each dim
    var first_arg = args[0];
    if (first_arg instanceof Matrix) {
        var tarray = first_arg._getdata();
        _rs = Array.prototype.slice.call(tarray);
    }
    else if (first_arg.length !== void 0) {
        _rs = Array.prototype.slice.call(first_arg);
    }
    else {
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
    var input_strides = [];
    var output_strides = [];
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
        input_strides.push(tmp_in_stride);
        output_strides.push(tmp_out_stride);
        tmp_in_stride *= indimsize;
        tmp_out_stride *= outdimsize;
    }
    input_strides.push(tmp_in_stride); //dummy
    rs_strides.push(n_copy); //dummy
    var output_steps = [];
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
exports.repmat = repmat;
function cat(dim) {
    var As = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        As[_i - 1] = arguments[_i];
    }
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
            concat_offsets.push(0); //not used
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
            }
            else {
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
        var args = [];
        for (var d = 0; d < dst_size.length; d++) {
            var element = A._size[d] || 1;
            if (d == dim - 1) {
                args.push(colon(concat_offsets[i], concat_offsets[i] + element - 1));
            }
            else {
                args.push(colon());
            }
        }
        args.push(A);
        dst.set.apply(dst, args);
    }
    return dst;
}
exports.cat = cat;
function horzcat() {
    var As = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        As[_i - 0] = arguments[_i];
    }
    return cat.apply(void 0, [2].concat(As));
}
exports.horzcat = horzcat;
function vertcat() {
    var As = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        As[_i - 0] = arguments[_i];
    }
    return cat.apply(void 0, [1].concat(As));
}
exports.vertcat = vertcat;
function permute(A, order) {
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
    var dst_size = [];
    for (var d = 0; d < ndim; d++) {
        var element = order[d] - 1; //order start from 1
        dst_size.push(src_size[element]);
    }
    var dst = new Matrix(dst_size, A._klass);
    var dst_strides = dst._strides.concat();
    while (dst_strides.length < ndim) {
        // occur when last dimensions are 1
        dst_strides.push(numel);
    }
    var dst_strides_perm = [];
    order.forEach(function (o, i) { return dst_strides_perm[o - 1] = dst_strides[i]; });
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
exports.permute = permute;
function ipermute(A, order) {
    // reverse order
    var rev_order = order.concat(); //have same elements
    for (var d = 0; d < order.length; d++) {
        rev_order[order[d] - 1] = d + 1;
    }
    return permute(A, rev_order);
}
exports.ipermute = ipermute;

},{"./colonwrap":13,"./matrix":16}],21:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var polyfill = require('./polyfill');
exports.Matrix = require('./matrix');
exports.Colon = require('./colon');
exports.colon = require('./colonwrap');
var util = require('./util');
var func_generator = require('./func_generator');
var shape_converter = require('./shape_converter');
var reduction = require('./reduction');
var mul = require('./mul');
var npy = require('./io/npy');
//export import MatrixCL = require('./cl/matrix_cl');
exports.CL = null; // for webcl
polyfill.polyfill();
exports.end = -1;
var initcl_result = null;
function initcl() {
    if (initcl_result != null) {
        return initcl_result;
    }
    try {
        var dummy = require('../src/cl/handwrittenjs/sushi_cl');
        initcl_result = true;
    }
    catch (ex) {
        console.error(ex);
        initcl_result = false;
    }
    return initcl_result;
}
exports.initcl = initcl;
function devicetype(A) {
    if (A instanceof exports.Matrix) {
        return 'cpu';
    }
    return null;
}
exports.devicetype = devicetype;
function autodestruct(f) {
    exports.Matrix.autodestruct_push();
    var mats_to_save = [];
    try {
        mats_to_save = f();
    }
    finally {
        if (typeof (mats_to_save) === 'object') {
            var mats_list;
            if (mats_to_save instanceof exports.Matrix) {
                // single matrix return
                mats_list = [mats_to_save];
            }
            else if (mats_to_save.length !== undefined) {
                //array-like
                mats_list = mats_to_save.filter(function (v) { return (v instanceof exports.Matrix); });
            }
            else {
                //dictionary
                mats_list = [];
                for (var k in mats_to_save) {
                    if (mats_to_save[k] instanceof exports.Matrix) {
                        mats_list.push(mats_to_save[k]);
                    }
                }
            }
            var stack_top = exports.Matrix._autodestruct_stack_top;
            var stack_second_top = exports.Matrix._autodestruct_stack[exports.Matrix._autodestruct_stack.length - 2];
            for (var i = 0; i < mats_list.length; i++) {
                var mat = mats_list[i];
                var delete_idx = stack_top.indexOf(mat);
                if (delete_idx >= 0) {
                    stack_top.splice(delete_idx, 1);
                    if (stack_second_top) {
                        stack_second_top.push(mat); //maybe destructed in nested autodestruct
                    }
                }
            }
        }
        exports.Matrix.autodestruct_pop();
    }
    return mats_to_save;
}
exports.autodestruct = autodestruct;
exports.typedarray2mat = exports.Matrix.typedarray2mat;
function zeros() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i - 0] = arguments[_i];
    }
    var format = util.calc_zeros_size(args);
    return new exports.Matrix(format.size, format.klass);
}
exports.zeros = zeros;
function ones() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i - 0] = arguments[_i];
    }
    var mat = zeros.apply(void 0, args);
    mat._data.fill(1);
    return mat;
}
exports.ones = ones;
function rand() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i - 0] = arguments[_i];
    }
    var mat = zeros.apply(void 0, args);
    var data = mat._data;
    for (var i = 0, length = data.length; i < length; i++) {
        data[i] = Math.random();
    }
    return mat;
}
exports.rand = rand;
function randi(imax) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    //first argument: imax or [imin, imax]
    var _imin = 1, _imax = 1;
    if (imax.length != null) {
        if (imax.length === 2) {
            _imin = imax[0];
            _imax = imax[1];
        }
        else {
            throw new Error('Invalid imax');
        }
    }
    else {
        _imax = imax;
    }
    var mat = zeros.apply(void 0, args);
    var data = mat._data;
    for (var i = 0, length = data.length; i < length; i++) {
        data[i] = Math.floor(Math.random() * (_imax - _imin + 1)) + _imin;
    }
    return mat;
}
exports.randi = randi;
function randn() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i - 0] = arguments[_i];
    }
    var mat = zeros.apply(void 0, args);
    var data = mat._data;
    for (var i = 0, length = data.length; i < length; i++) {
        var alpha = Math.random();
        var beta = Math.random();
        data[i] = Math.sqrt(-2 * Math.log(alpha)) * Math.sin(2 * Math.PI * beta);
    }
    return mat;
}
exports.randn = randn;
function eye() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i - 0] = arguments[_i];
    }
    var mat = zeros.apply(void 0, args);
    var min_dim = Math.min(mat._size[0], mat._size[1]);
    for (var i = 1; i <= min_dim; i++) {
        mat.set(i, i, 1);
    }
    return mat;
}
exports.eye = eye;
function size(X, dim) {
    if (dim === void 0) {
        // return as row vector
        return jsa2mat([X._size], false, 'int32'); //int32 to represent value > 8M accurately
    }
    else {
        if (dim <= 0 || !exports.Matrix._isinteger(dim)) {
            throw new Error('Invalid dimension');
        }
        return X._size[dim - 1] || 1;
    }
}
exports.size = size;
function sizejsa(X) {
    return X._size;
}
exports.sizejsa = sizejsa;
function jsa2mat(A, one_d_column, klass) {
    return exports.Matrix.jsa2mat(A, one_d_column, klass);
}
exports.jsa2mat = jsa2mat;
function mat2jsa(A, one_d_flatten) {
    if (one_d_flatten === void 0) { one_d_flatten = false; }
    return A.mat2jsa(one_d_flatten);
}
exports.mat2jsa = mat2jsa;
function length(X) {
    return Math.max.apply(null, X._size);
}
exports.length = length;
function ndims(X) {
    return X._ndims;
}
exports.ndims = ndims;
function numel(X) {
    return X._numel;
}
exports.numel = numel;
function iscolumn(A) {
    return A._ndims == 2 && A._size[1] == 1;
}
exports.iscolumn = iscolumn;
function isrow(A) {
    return A._ndims == 2 && A._size[0] == 1;
}
exports.isrow = isrow;
function isvector(A) {
    return A._ndims == 2 && (A._size[0] == 1 || A._size[1] == 1);
}
exports.isvector = isvector;
function isempty(A) {
    return A._numel == 0;
}
exports.isempty = isempty;
function ismatrix(A) {
    return A._ndims == 2;
}
exports.ismatrix = ismatrix;
function isscalar(A) {
    // currently, number is not supported
    return A._numel == 1;
}
exports.isscalar = isscalar;
function klass(object) {
    return object._klass;
}
exports.klass = klass;
function gpuArray(A) {
    //overriden by sushi_cl
    return util.as_mat(A).copy();
}
exports.gpuArray = gpuArray;
function gather(A) {
    //overriden by sushi_cl
    return A.copy();
}
exports.gather = gather;
function jsaequal(a, b) {
    if (a.length != b.length) {
        return false;
    }
    for (var i = 0; i < a.length; i++) {
        if (a[i] != b[i]) {
            return false;
        }
    }
    return true;
}
// If input is 1x1 matrix, returns number
function _singlemat2number(A) {
    if ((A instanceof exports.Matrix) && isscalar(A)) {
        return A.get_scalar([1]);
    }
    return A;
}
//equality http://jp.mathworks.com/help/matlab/relational-operators.html
/**
 * Compares elements of two matrices. One of the input can be scalar number.
 *
 * @param A Input matrix.
 * @param B Input matrix.
 * @return logical matrix. 1 if A(i) == B(i).
 */
exports.eq = function (A, B) {
    throw new Error();
};
exports.eq = func_generator.make_compare_func_all('Number(%a == %b)');
/**
 * Compares elements of two matrices. One of the input can be scalar number.
 *
 * @param A Input matrix.
 * @param B Input matrix.
 * @return logical matrix. 1 if A(i) >= B(i).
 */
exports.ge = function (A, B) {
    throw new Error();
};
exports.ge = func_generator.make_compare_func_all('Number(%a >= %b)');
/**
 * Compares elements of two matrices. One of the input can be scalar number.
 *
 * @param A Input matrix.
 * @param B Input matrix.
 * @return logical matrix. 1 if A(i) > B(i).
 */
exports.gt = function (A, B) {
    throw new Error();
};
exports.gt = func_generator.make_compare_func_all('Number(%a > %b)');
/**
 * Compares elements of two matrices. One of the input can be scalar number.
 *
 * @param A Input matrix.
 * @param B Input matrix.
 * @return logical matrix. 1 if A(i) <= B(i).
 */
exports.le = function (A, B) {
    throw new Error();
};
exports.le = func_generator.make_compare_func_all('Number(%a <= %b)');
/**
 * Compares elements of two matrices. One of the input can be scalar number.
 *
 * @param A Input matrix.
 * @param B Input matrix.
 * @return logical matrix. 1 if A(i) < B(i).
 */
exports.lt = function (A, B) {
    throw new Error();
};
exports.lt = func_generator.make_compare_func_all('Number(%a < %b)');
/**
 * Compares elements of two matrices. One of the input can be scalar number.
 *
 * @param A Input matrix.
 * @param B Input matrix.
 * @return logical matrix. 1 if A(i) != B(i).
 */
exports.ne = function (A, B) {
    throw new Error();
};
exports.ne = func_generator.make_compare_func_all('Number(%a != %b)');
/**
 * Checks if all matrices are equal. Assumes NaN is not equal to NaN.
 *
 * @param As Input matrices.
 * @return true if all matrices are the same regarding both size and value of elements.
 */
exports.isequal = function () {
    var As = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        As[_i - 0] = arguments[_i];
    }
    throw new Error();
};
exports.isequal = func_generator.isequal;
/**
 * Checks if all matrices are equal. Assumes NaN is equal to NaN.
 *
 * @param As Input matrices.
 * @return true if all matrices are the same regarding both size and value of elements.
 */
exports.isequaln = function () {
    var As = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        As[_i - 0] = arguments[_i];
    }
    throw new Error();
};
exports.isequaln = func_generator.isequaln;
/**
 * Compares if elements of two matrices are close. One of the input can be scalar number.
 *
 * @param A Input matrix.
 * @param B Input matrix.
 * @return logical matrix. 1 if abs(A(i) - B(i)) <= atol + rtol * abs(B(i)).
 */
exports.isclose = function (A, B, rtol, atol, equal_nan) {
    if (rtol === void 0) { rtol = 1e-5; }
    if (atol === void 0) { atol = 1e-8; }
    if (equal_nan === void 0) { equal_nan = false; }
    throw new Error();
};
exports.isclose = func_generator.isclose;
/**
 * Compares if all the elements of two matrices are close. One of the input can be scalar number. See also [[isclose]]
 *
 * @param A Input matrix.
 * @param B Input matrix.
 * @return true if all elements of isclose(A, B) are 1.
 */
exports.allclose = function (A, B, rtol, atol, equal_nan) {
    throw new Error();
};
exports.allclose = func_generator.allclose;
exports.plus = func_generator.make_binary_arith_func_all('%a + %b');
exports.minus = func_generator.make_binary_arith_func_all('%a - %b');
exports.times = func_generator.make_binary_arith_func_all('%a * %b');
exports.rdivide = func_generator.make_binary_arith_func_all('%a / %b');
exports.ldivide = func_generator.make_binary_arith_func_all('%b / %a');
exports.power = func_generator.make_binary_arith_func_all('Math.pow(%a,%b)');
exports.floor = func_generator.make_unary_arith_func_all('Math.floor(%a)');
exports.fix = func_generator.make_unary_arith_func_all('(%a > 0 ? Math.floor(%a) : Math.ceil(%a))');
exports.ceil = func_generator.make_unary_arith_func_all('Math.ceil(%a)');
exports.uplus = func_generator.make_unary_arith_func_all('+%a');
exports.uminus = func_generator.make_unary_arith_func_all('-%a');
exports.exp = func_generator.make_unary_arith_func_all('Math.exp(%a)');
exports.log = func_generator.make_unary_arith_func_all('Math.log(%a)');
exports.max = reduction.max;
exports.min = reduction.min;
exports.argmax = reduction.argmax;
exports.argmin = reduction.argmin;
exports.sum = reduction.sum;
exports.mean = reduction.mean;
exports.prod = reduction.prod;
exports.std = reduction.std;
exports.variance = reduction.variance;
exports.mtimes = mul.mtimes;
function reshape(A) {
    var sz = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        sz[_i - 1] = arguments[_i];
    }
    var dst = A.copy();
    try {
        dst.reshape_inplace.apply(dst, sz);
        return dst;
    }
    catch (error) {
        dst.destruct();
        throw error;
    }
}
exports.reshape = reshape;
function squeeze(A) {
    var dst = A.copy();
    dst.squeeze_inplace();
    return dst;
}
exports.squeeze = squeeze;
exports.transpose = shape_converter.transpose;
exports.t = exports.transpose; //alias
exports.repmat = shape_converter.repmat;
exports.cat = shape_converter.cat;
exports.horzcat = shape_converter.horzcat;
exports.vertcat = shape_converter.vertcat;
exports.permute = shape_converter.permute;
exports.ipermute = shape_converter.ipermute;
exports.npyread = npy.npyread;
exports.npysave = npy.npysave;
//indexing
//TODO:test
function sub2ind(matrixSize) {
    var dimSub = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        dimSub[_i - 1] = arguments[_i];
    }
    //note: 'end' cannot be used in matlab sub2ind; only positive index is valid
    var msizejsa;
    if (matrixSize instanceof exports.Matrix) {
        if (!isrow(matrixSize) || matrixSize._numel < 2) {
            throw new Error('matrixSize must be row vector');
        }
        msizejsa = matrixSize.mat2jsa(true);
    }
    else {
        msizejsa = matrixSize;
    }
    var stride = 1;
    var idx = 1;
    for (var i = 0; i < msizejsa.length; i++) {
        idx += ((dimSub[i] || 1) - 1) * stride;
        stride *= msizejsa[i];
    }
    return idx;
}
exports.sub2ind = sub2ind;
function colonvec(start, stop_step, stop, klass) {
    if (klass === void 0) { klass = 'single'; }
    // make row vector by i:j:k
    var step;
    if (stop == null) {
        stop = stop_step;
        step = 1;
    }
    else {
        step = stop_step;
    }
    var n_item = Math.max(Math.floor((stop - start) / step) + 1, 0);
    var vec = new exports.Matrix([1, n_item], klass);
    var vec_data = vec._data;
    for (var i = 0; i < n_item; i++) {
        vec_data[i] = start + step * i;
    }
    return vec;
}
exports.colonvec = colonvec;

},{"../src/cl/handwrittenjs/sushi_cl":8,"./colon":12,"./colonwrap":13,"./func_generator":14,"./io/npy":15,"./matrix":16,"./mul":17,"./polyfill":18,"./reduction":19,"./shape_converter":20,"./util":22}],22:[function(require,module,exports){
"use strict";
// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
var Matrix = require('./matrix');
/**
 * Convert array-like to Matrix, number to 1x1 Matrix
 */
function as_mat(A) {
    if (A instanceof Matrix) {
        return A;
    }
    else {
        //array to matrix
        //number to 1x1 matrix
        return Matrix.jsa2mat(A);
    }
}
exports.as_mat = as_mat;
/**
 * Convert array-like to Matrix, preserving other type
 */
function as_mat_or_scalar(A) {
    if (A instanceof Matrix) {
        return A;
    }
    else if (typeof (A) === 'object' && A.length != null) {
        //array-like to Matrix
        return Matrix.jsa2mat(A);
    }
    else {
        return A; //preserve number
    }
}
exports.as_mat_or_scalar = as_mat_or_scalar;
//finds common output class for matrices
function commonklassstr() {
    var klasses = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        klasses[_i - 0] = arguments[_i];
    }
    // single > int32 > uint8 > logical
    var klass_order = ['single', 'int32', 'uint8', 'logical'];
    if (klasses.length == 0) {
        return klass_order[0];
    }
    var best_klass = 3;
    for (var i = 0; i < klasses.length; i++) {
        var element = klasses[i];
        var score = klass_order.indexOf(element);
        if (score < 0) {
            throw new Error('Unknown klass');
        }
        best_klass = Math.min(score, best_klass);
    }
    return klass_order[best_klass];
}
exports.commonklassstr = commonklassstr;
function commonklass() {
    var mats = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        mats[_i - 0] = arguments[_i];
    }
    //number not affects class decision
    var klasses = [];
    for (var i = 0; i < mats.length; i++) {
        var element = mats[i];
        if (element instanceof Matrix) {
            klasses.push(element._klass);
        }
    }
    return commonklassstr.apply(void 0, klasses);
}
exports.commonklass = commonklass;
function issamesize(sizea, sizeb) {
    for (var i = 0; i < sizea.length; i++) {
        if (sizea[i] != sizeb[i]) {
            return false;
        }
    }
    return true;
}
exports.issamesize = issamesize;
function force_cpu(A) {
    if (A instanceof Matrix) {
        return A.to_cpu();
    }
    else {
        return A;
    }
}
exports.force_cpu = force_cpu;
function force_cpu_scalar(A) {
    if (A instanceof Matrix) {
        if (A._numel == 1) {
            return A.get();
        }
        else {
            return A.to_cpu();
        }
    }
    else {
        return A;
    }
}
exports.force_cpu_scalar = force_cpu_scalar;
function jsaequal(a, b) {
    if (a.length != b.length) {
        return false;
    }
    for (var i = 0; i < a.length; i++) {
        if (a[i] != b[i]) {
            return false;
        }
    }
    return true;
}
exports.jsaequal = jsaequal;
function calc_zeros_size(args) {
    var size;
    var klass = 'single';
    if (args.length >= 1 && typeof (args[args.length - 1]) === 'string') {
        //zeros(_,typename)
        klass = args[args.length - 1];
        args.pop();
    }
    else if (args.length >= 2 && args[args.length - 2] == 'like') {
        //zeros('like', mat)
        klass = args[args.length - 1]._klass;
        args.pop();
        args.pop();
    }
    if (args.length == 0) {
        // return 1x1 matrix
        size = [1, 1];
    }
    else {
        if (args.length == 1) {
            if (typeof (args[0]) === 'number') {
                // nxn matrix
                size = [args[0], args[0]];
            }
            else if (args[0] instanceof Matrix) {
                // size given as matrix
                var sizemat = args[0];
                if (sizemat._size.length == 2 && sizemat._size[0] == 1 && sizemat._size[1] >= 1) {
                    size = Array.prototype.slice.call(sizemat._getdata());
                }
                else {
                    throw new Error('matrix size is not valid row vector');
                }
            }
            else {
                throw new Error('Unknown data type of argument 0');
            }
        }
        else {
            size = args;
        }
    }
    return { size: size, klass: klass };
}
exports.calc_zeros_size = calc_zeros_size;

},{"./matrix":16}]},{},[1])(1)
});