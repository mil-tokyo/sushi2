'use strict';
// experimental porting of clBLAS sgemm
// https://github.com/clMathLibraries/clBLAS
// kernel is from clBLAS
// clBlas: Apache License 2.0
// Copyright 2013 Advanced Micro Devices, Inc.

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
