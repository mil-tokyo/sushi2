// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
import Matrix = require('./matrix');
import util = require('./util');
import func_generator = require('./func_generator');

export type MatrixOrNumber = util.MatrixOrNumber;

function max_along_axis_old(A: Matrix, dim?: number): Matrix {
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

function _argmax_ones_like(A: Matrix): { M: Matrix, I: Matrix } {
  var amax = new Matrix(A._size, 'int32');
  amax._data.fill(1);
  return { M: A, I: amax };
}

function make_reduction_along_axis(var_decl: string, var_update: string, result_assign: string, out_argmax: boolean) {
  var f: any;
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

function make_reduction_along_axis_stat(var_decl: string, var_update: string, result_assign: string) {
  var f: any;
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

var max_along_axis = make_reduction_along_axis('var curret = val;',
  'if(val>curret){curret=val;}',
  'dst_data[dst_idx]=curret;', false);
var max_elementwise = func_generator.make_binary_arith_func_all('Math.max(%a,%b)');

var min_along_axis = make_reduction_along_axis('var curret = val;',
  'if(val<curret){curret=val;}',
  'dst_data[dst_idx]=curret;', false);
var min_elementwise = func_generator.make_binary_arith_func_all('Math.min(%a,%b)');

export function max(A: MatrixOrNumber, B?: MatrixOrNumber, dim?: number): Matrix {
  if (B == null) {
    //max along axis
    return max_along_axis(util.as_mat(A), dim);
  } else {
    //elementwise max
    return max_elementwise(A, B);
  }
}


export function min(A: MatrixOrNumber, B?: MatrixOrNumber, dim?: number): Matrix {
  if (B == null) {
    return min_along_axis(util.as_mat(A), dim);
  } else {
    return min_elementwise(A, B);
  }
}


var argmax_along_axis = make_reduction_along_axis('var curret = val, curamax = 0;',
  'if(val>curret){curret=val;curamax=red;}',
  'dst_data[dst_idx]=curret; amax_data[dst_idx]=curamax+1;', true);
export function argmax(A: MatrixOrNumber, dummy?: any, dim?: number): { M: Matrix, I: Matrix } {
  return argmax_along_axis(util.as_mat(A), dim);
}

var argmin_along_axis = make_reduction_along_axis('var curret = val, curamax = 0;',
  'if(val<curret){curret=val;curamax=red;}',
  'dst_data[dst_idx]=curret; amax_data[dst_idx]=curamax+1;', true);
export function argmin(A: MatrixOrNumber, dummy?: any, dim?: number): { M: Matrix, I: Matrix } {
  return argmin_along_axis(util.as_mat(A), dim);
}

function sum_mean(A: Matrix, args: any[], f: (A: Matrix, dim: number) => Matrix): Matrix {
  var dim = undefined;
  var outtype = undefined;
  while (args.length > 0) {
    var arg = args.pop();
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
  return f(A, dim);
}

var sum_along_axis = make_reduction_along_axis_stat('var curret = val;',
  'curret += val;', 'dst_data[dst_idx] = curret;');
export function sum(A: Matrix): Matrix;
export function sum(A: Matrix, dim: number, outtype?: string): Matrix;
export function sum(A: Matrix, outtype?: string): Matrix;
export function sum(A: Matrix, ...args: any[]): Matrix {
  return sum_mean(A, args, sum_along_axis);
}

var mean_along_axis = make_reduction_along_axis_stat('var curret = val;',
  'curret += val;', 'dst_data[dst_idx] = curret / reduction_count;');
export function mean(A: Matrix): Matrix;
export function mean(A: Matrix, dim: number, outtype?: string): Matrix;
export function mean(A: Matrix, outtype?: string): Matrix;
export function mean(A: Matrix, ...args: any[]): Matrix {
  return sum_mean(A, args, mean_along_axis);
}

var prod_along_axis = make_reduction_along_axis_stat('var curret = val;',
  'curret *= val;', 'dst_data[dst_idx] = curret;');
export function prod(A: Matrix): Matrix;
export function prod(A: Matrix, dim: number, outtype?: string): Matrix;
export function prod(A: Matrix, outtype?: string): Matrix;
export function prod(A: Matrix, ...args: any[]): Matrix {
  return sum_mean(A, args, prod_along_axis);
}

//w=0: normalize by N-1
var variance_along_axis_w0 = make_reduction_along_axis_stat('var normalsum = val; var sqsum = val * val;',
  'normalsum += val; sqsum += val * val;', 'dst_data[dst_idx] = (sqsum - normalsum * normalsum / reduction_count) / Math.max(reduction_count - 1, 1);');
//w=1: normalize by N
var variance_along_axis_w1 = make_reduction_along_axis_stat('var normalsum = val; var sqsum = val * val;',
  'normalsum += val; sqsum += val * val;', 'dst_data[dst_idx] = (sqsum - normalsum * normalsum / reduction_count) / reduction_count;');
export function variance(A: Matrix, w: number = 0, dim?: number): Matrix {
  if (w == 0) {
    return variance_along_axis_w0(A, dim);
  } else if (w == 1) {
    return variance_along_axis_w1(A, dim);
  } else {
    throw new Error('w must be 0 or 1');
  }
}

//w=0: normalize by N-1
var std_along_axis_w0 = make_reduction_along_axis_stat('var normalsum = val; var sqsum = val * val;',
  'normalsum += val; sqsum += val * val;', 'dst_data[dst_idx] = Math.sqrt((sqsum - normalsum * normalsum / reduction_count) / Math.max(reduction_count - 1, 1));');
//w=1: normalize by N
var std_along_axis_w1 = make_reduction_along_axis_stat('var normalsum = val; var sqsum = val * val;',
  'normalsum += val; sqsum += val * val;', 'dst_data[dst_idx] = Math.sqrt((sqsum - normalsum * normalsum / reduction_count) / reduction_count);');
export function std(A: Matrix, w: number = 0, dim?: number): Matrix {
  if (w == 0) {
    return std_along_axis_w0(A, dim);
  } else if (w == 1) {
    return std_along_axis_w1(A, dim);
  } else {
    throw new Error('w must be 0 or 1');
  }
}
