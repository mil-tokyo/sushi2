export import Matrix = require('./matrix');
export import Colon = require('./colon');
export import colon = require('./colonwrap');
import util = require('./util');
import func_generator = require('./func_generator');
import shape_converter = require('./shape_converter');
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

export var plus = func_generator.make_binary_arith_func_all('%a + %b');
export var minus = func_generator.make_binary_arith_func_all('%a - %b');
export var times = func_generator.make_binary_arith_func_all('%a * %b');
export var rdivide = func_generator.make_binary_arith_func_all('%a / %b');
export var ldivide = func_generator.make_binary_arith_func_all('%b / %a');
export var power = func_generator.make_binary_arith_func_all('Math.pow(%a,%b)');

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
