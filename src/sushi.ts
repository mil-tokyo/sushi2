export import Matrix = require('./matrix');
export import Colon = require('./colon');
export import colon = require('./colonwrap');
import util = require('./util');
import func_generator = require('./func_generator');
import shape_converter = require('./shape_converter');
import reduction = require('./reduction');
import mul = require('./mul');
//export import MatrixCL = require('./cl/matrix_cl');
export var CL: any = null;// for webcl

export var end = -1;
export type MatrixOrNumber = util.MatrixOrNumber;
export type MatrixLike = Matrix | number | number[] | number[][];

declare var require;
export function initcl(): boolean {
  try {
    var dummy: any = require('../src/cl/handwrittenjs/sushi_cl');
  } catch (ex) {
    console.error(ex);
    return false;
  }
  return true;
}

export function devicetype(A: Matrix): string {
  if (A instanceof Matrix) {
    return 'cpu';
  }
  return null;
}

export function autodestruct(f: () => any): any {
  Matrix.autodestruct_push();
  var mats_to_save = [];
  try {
    mats_to_save = f();
  } finally {
    if (typeof (mats_to_save) === 'object') {
      var mats_list;
      if (mats_to_save instanceof Matrix) {
        // single matrix return
        mats_list = [mats_to_save];
      } else if (mats_to_save.length !== undefined) {
        //array-like
        mats_list = mats_to_save.filter((v) => (v instanceof Matrix));
      } else {
        //dictionary
        mats_list = [];
        for (var k in mats_to_save) {
          if (mats_to_save[k] instanceof Matrix) {
            mats_list.push(mats_to_save[k]);
          }
        }
      }

      var stack_top = Matrix._autodestruct_stack_top;
      var stack_second_top = Matrix._autodestruct_stack[Matrix._autodestruct_stack.length - 2];
      for (var i = 0; i < mats_list.length; i++) {
        var mat = mats_list[i];
        var delete_idx = stack_top.indexOf(mat);
        if (delete_idx >= 0) {
          stack_top.splice(delete_idx, 1);
          if (stack_second_top) {
            stack_second_top.push(mat);//maybe destructed in nested autodestruct
          }
        }
      }
    }
    Matrix.autodestruct_pop();
  }
  return mats_to_save;
}

export var typedarray2mat = Matrix.typedarray2mat;

export function zeros(...args: any[]): Matrix {
  var format = util.calc_zeros_size(args);
  return new Matrix(format.size, format.klass);
}

export function ones(...args: any[]): Matrix {
  var mat = zeros(...args);
  mat._data.fill(1);
  return mat;
}

export function rand(...args: any[]): Matrix {
  var mat = zeros(...args);
  var data = mat._data;
  for (var i = 0, length = data.length; i < length; i++) {
    data[i] = Math.random();
  }
  return mat;
}

export function randi(imax: number | number[], ...args: any[]): Matrix {
  //first argument: imax or [imin, imax]
  var _imin = 1, _imax = 1;
  if ((<any>imax).length != null) {
    if ((<any>imax).length === 2) {
      _imin = imax[0];
      _imax = imax[1];
    } else {
      throw new Error('Invalid imax');
    }
  } else {
    _imax = <number>imax;
  }

  var mat = zeros(...args);
  var data = mat._data;
  for (var i = 0, length = data.length; i < length; i++) {
    data[i] = Math.floor(Math.random() * (_imax - _imin + 1)) + _imin;
  }
  return mat;
}

export function randn(...args: any[]): Matrix {
  var mat = zeros(...args);
  var data = mat._data;
  for (var i = 0, length = data.length; i < length; i++) {
    var alpha = Math.random();
    var beta = Math.random();
    data[i] = Math.sqrt(-2 * Math.log(alpha)) * Math.sin(2 * Math.PI * beta);
  }
  return mat;
}

export function eye(...args: any[]): Matrix {
  var mat = zeros(...args);
  var min_dim = Math.min(mat._size[0], mat._size[1]);
  for (var i = 1; i <= min_dim; i++) {
    mat.set(i, i, 1);
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

export function gpuArray(A: MatrixLike): Matrix {
  //overriden by sushi_cl
  return util.as_mat(A).copy();
}

export function gather(A: Matrix): Matrix {
  //overriden by sushi_cl
  return A.copy();
}

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


//equality http://jp.mathworks.com/help/matlab/relational-operators.html
export var eq = func_generator.make_compare_func_all('Number(%a == %b)');
export var ge = func_generator.make_compare_func_all('Number(%a >= %b)');
export var gt = func_generator.make_compare_func_all('Number(%a > %b)');
export var le = func_generator.make_compare_func_all('Number(%a <= %b)');
export var lt = func_generator.make_compare_func_all('Number(%a < %b)');
export var ne = func_generator.make_compare_func_all('Number(%a != %b)');
export var isequal = func_generator.isequal;
export var isequaln = func_generator.isequaln;
export var isclose = func_generator.isclose;
//export var allclose = func_generator.allclose;

export var plus = func_generator.make_binary_arith_func_all('%a + %b');
export var minus = func_generator.make_binary_arith_func_all('%a - %b');
export var times = func_generator.make_binary_arith_func_all('%a * %b');
export var rdivide = func_generator.make_binary_arith_func_all('%a / %b');
export var ldivide = func_generator.make_binary_arith_func_all('%b / %a');
export var power = func_generator.make_binary_arith_func_all('Math.pow(%a,%b)');
export var floor = func_generator.make_unary_arith_func_all('Math.floor(%a)');
export var fix = func_generator.make_unary_arith_func_all('(%a > 0 ? Math.floor(%a) : Math.ceil(%a))');
export var ceil = func_generator.make_unary_arith_func_all('Math.ceil(%a)');
export var uplus = func_generator.make_unary_arith_func_all('+%a');
export var uminus = func_generator.make_unary_arith_func_all('-%a');
export var exp = func_generator.make_unary_arith_func_all('Math.exp(%a)');
export var log = func_generator.make_unary_arith_func_all('Math.log(%a)');

export var max = reduction.max;
export var min = reduction.min;
export var argmax = reduction.argmax;
export var argmin = reduction.argmin;
export var sum = reduction.sum;

export var mtimes = mul.mtimes;

export function reshape(A: Matrix, ...sz: any[]): Matrix {
  var dst = A.copy();
  try {
    dst.reshape_inplace(...sz);
    return dst;
  } catch (error) {
    dst.destruct();
    throw error;
  }
}

export function squeeze(A: Matrix): Matrix {
  var dst = A.copy();
  dst.squeeze_inplace();
  return dst;
}

export var transpose = shape_converter.transpose;
export var t = transpose;//alias

export var repmat = shape_converter.repmat;

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

export function colonvec(start: number, stop_step: number, stop?: number, klass = 'single'): Matrix {
  // make row vector by i:j:k
  var step;
  if (stop == null) {
    stop = stop_step;
    step = 1;
  } else {
    step = stop_step;
  }

  var n_item = Math.max(Math.floor((stop - start) / step) + 1, 0);
  var vec = new Matrix([1, n_item], klass);
  var vec_data = vec._data;
  for (var i = 0; i < n_item; i++) {
    vec_data[i] = start + step * i;
  }
  return vec;
}
