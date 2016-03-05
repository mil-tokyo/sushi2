export import Matrix = require('./matrix');
export import Colon = require('./colon');
export import colon = require('./colonwrap');
import util = require('./util');
//export import MatrixCL = require('./cl/matrix_cl');

export var end = -1;
declare type MatrixOrNumber = Matrix | number;

export function autodestruct(f: () => any): any {
  Matrix.autodestruct_push();
  var mats_to_save = [];
  try {
    mats_to_save = f();
  } finally {
    var mats_list;
    if (mats_to_save instanceof Matrix) {
      // single matrix return
      mats_list = [mats_to_save];
    } else {
      mats_list = mats_to_save;
    }
    for (var i = 0; i < mats_list.length; i++) {
      var mat = mats_list[i];
      var delete_idx = Matrix._autodestruct_stack_top.indexOf(mat);
      if (delete_idx >= 0) {
        Matrix._autodestruct_stack_top.splice(delete_idx, 1);
      }
    }
    Matrix.autodestruct_pop();
  }
  return mats_to_save;
}

export function zeros(...args: any[]): Matrix {
  var mat = null;
  var klass = 'single';
  if (args.length >= 1 && typeof (args[args.length - 1]) === 'string') {
    //zeros(_,typename)
    klass = args[args.length - 1];
    args.pop();
  } else if (args.length >= 2 && args[args.length - 2] == 'like') {
    //zeros('like', mat)
    klass = args[args.length - 1]._klass;
    args.pop();
    args.pop();
  }
  if (args.length == 0) {
    // return 1x1 matrix
    mat = new Matrix([1, 1], klass);
  } else {

    if (args.length == 1) {
      if (typeof (args[0]) === 'number') {
        // nxn matrix
        mat = new Matrix([args[0], args[0]], klass);
      } else if (args[0] instanceof Matrix) {
        // size given as matrix
        var sizemat: Matrix = args[0];
        if (sizemat._size.length == 2 && sizemat._size[0] == 1 && sizemat._size[1] >= 1) {
          mat = new Matrix(Array.prototype.slice.call(sizemat._data), klass);
        } else {
          throw new Error('matrix size is not valid row vector');
        }
      } else {
        throw new Error('Unknown data type of argument 0');
      }
    } else {
      mat = new Matrix(args, klass);
    }
  }

  return mat;
}

export function ones(...args: any[]): Matrix {
  var mat = zeros(...args);
  for (var i = 0; i < mat._data.length; i++) {
    mat._data[i] = 1;
  }
  return mat;
}

export function size(X: Matrix): Matrix;
export function size(X: Matrix, dim: number): number;
export function size(X: Matrix, dim?: number): any {
  if (dim === void 0) {
    // return as row vector
    return jsa2mat([X._size], false, 'int32');//int32 to represent value > 8M accurately
  } else {
    if (dim <= 0 || !Matrix._isinteger(dim)) {
      throw new Error('Invalid dimension');
    }

    return X._size[dim - 1] || 1;
  }
}

export function sizejsa(X: Matrix): number[] {
  return X._size;
}

export function jsa2mat(A: any[], one_d_column?: boolean, klass?: string): Matrix {
  return Matrix.jsa2mat(A, one_d_column, klass);
}

export function mat2jsa(A: Matrix, one_d_flatten: boolean = false): any[] {
  return A.mat2jsa(one_d_flatten);
}

export function length(X: Matrix): number {
  return Math.max.apply(null, X._size);
}

export function ndims(X: Matrix): number {
  return X._ndims;
}

export function numel(X: Matrix): number {
  return X._numel;
}

export function iscolumn(A: Matrix): boolean {
  return A._ndims == 2 && A._size[1] == 1;
}
export function isrow(A: Matrix): boolean {
  return A._ndims == 2 && A._size[0] == 1;
}
export function isvector(A: Matrix): boolean {
  return A._ndims == 2 && (A._size[0] == 1 || A._size[1] == 1);
}
export function isempty(A: Matrix): boolean {
  return A._numel == 0;
}
export function ismatrix(A: Matrix): boolean {
  return A._ndims == 2;
}
export function isscalar(A: Matrix): boolean {
  // currently, number is not supported
  return A._numel == 1;
}

export function klass(object: Matrix): string {
  return object._klass;
}

export function gpuArray(A: Matrix): Matrix {
  //overriden by sushi_cl
  return A.copy();
}

export function gather(A: Matrix): Matrix {
  //overriden by sushi_cl
  return A.copy();
}

//equality http://jp.mathworks.com/help/matlab/relational-operators.html
function jsaequal(a: any[], b: any[]): boolean {
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
function _singlemat2number(A: MatrixOrNumber): MatrixOrNumber {
  if ((A instanceof Matrix) && isscalar(A)) {
    return A.get_scalar([1]);
  }
  
  return A;
}

function make_compare_func_all(operation: string): (A: MatrixOrNumber, B: MatrixOrNumber) => Matrix {
  var func_s_s = make_binary_arith_func(operation, false, false, 'logical');
  var func_s_m = make_binary_arith_func(operation, false, true, 'logical');
  var func_m_s = make_binary_arith_func(operation, true, false, 'logical');
  var func_m_m = make_binary_arith_func(operation, true, true, 'logical');
  return function (A: MatrixOrNumber, B: MatrixOrNumber) {
    A = util.force_cpu_scalar(A);
    B = util.force_cpu_scalar(B);
    if (A instanceof Matrix) {
      if (B instanceof Matrix) {
        return func_m_m(A, B);
      } else {
        return func_m_s(A, B);
      }
    } else {
      if (B instanceof Matrix) {
        return func_s_m(A, B);
      } else {
        return func_s_s(A, B);
      }
    }
  }
}

export var eq = make_compare_func_all('Number(%a == %b)');
export var ge = make_compare_func_all('Number(%a >= %b)');
export var gt = make_compare_func_all('Number(%a > %b)');
export var le = make_compare_func_all('Number(%a <= %b)');
export var lt = make_compare_func_all('Number(%a < %b)');
export var ne = make_compare_func_all('Number(%a != %b)');

function make_binary_arith_func(operation: string, a_mat: boolean, b_mat: boolean, dst_klass: string): (A: MatrixOrNumber, B: MatrixOrNumber) => Matrix {
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
  } else {
    l_get_a = 'A';
    if (b_mat) {
      l_shape = 'B._size';
    } else {
      l_shape = '[1,1]';
    }
  }
  
  if (b_mat) {
    l_def_bdata = 'var b_data = B._data;';
    l_get_b = 'b_data[i]';
  } else {
    l_get_b = 'B';
  }
  
  var l_opr_formatted = operation.replace('%a', l_get_a).replace('%b', l_get_b);
  
  var f: any;
  var e_Matrix = Matrix;
  var e_util = util;
  
  eval([
    'f = function(A, B) {',
    'var shape = ' + l_shape + ';',
    l_size_check,
    l_def_adata,
    l_def_bdata,
    'var dst = new e_Matrix(shape, "'+dst_klass+'");',
    'var dst_data = dst._data;',
    'for (var i = 0, length = dst._numel; i < length; i++) {',
    '  dst_data[i] = ' + l_opr_formatted + ';',
    '}',
    'return dst;',
    '}'
  ].join('\n'));
  return f;
}

function make_binary_arith_func_all(operation: string): (A: MatrixOrNumber, B: MatrixOrNumber) => Matrix {
  var funcs = {};
  return function (A: MatrixOrNumber, B: MatrixOrNumber) {
    A = util.force_cpu_scalar(A);
    B = util.force_cpu_scalar(B);
    var dst_klass = util.commonklass(A, B);
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
  }
}

export var plus = make_binary_arith_func_all('%a + %b');
export var minus = make_binary_arith_func_all('%a - %b');
export var times = make_binary_arith_func_all('%a * %b');
export var rdivide = make_binary_arith_func_all('%a / %b');
export var ldivide = make_binary_arith_func_all('%b / %a');
export var power = make_binary_arith_func_all('Math.pow(%a,%b)');

//indexing
//TODO:test
export function sub2ind(matrixSize: Matrix | number[], ...dimSub: number[]): number {
  //note: 'end' cannot be used in matlab sub2ind; only positive index is valid
  var msizejsa: number[];
  if (matrixSize instanceof Matrix) {
    if (!isrow(matrixSize) || matrixSize._numel < 2) {
      throw new Error('matrixSize must be row vector');
    }
    msizejsa = matrixSize.mat2jsa(true);
  } else {
    msizejsa = <number[]>matrixSize;
  }

  var stride = 1;
  var idx = 1;
  for (var i = 0; i < msizejsa.length; i++) {
    idx += ((dimSub[i] || 1) - 1) * stride;
    stride *= msizejsa[i];
  }

  return idx;
}
