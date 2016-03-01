export import Matrix = require('./matrix');
export import Colon = require('./colon');
export import colon = require('./colonwrap');

export var end = -1;
declare type MatrixOrNumber = Matrix | number;

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

//finds common output class for matrices
function _commonklassstr(...klasses: string[]): string {
  // single > int32 > uint8 > logical
  var klass_order = ['single','int32','uint8','logical'];
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

function _commonklass(...mats: MatrixOrNumber[]): string {
  //number not affects class decision
  var klasses: string[] = [];
  for (var i = 0; i < mats.length; i++) {
    var element = mats[i];
    if (element instanceof Matrix) {
      klasses.push(element._klass);
    }
  }
  
  return _commonklassstr(...klasses);
}

function _compare(A: MatrixOrNumber, B: MatrixOrNumber, comp: (a: any, b: any) => boolean): Matrix {
  var shape: number[];
  var both_mat = false;
  var mat: Matrix;
  A = _singlemat2number(A);
  B = _singlemat2number(B);
  if (A instanceof Matrix) {
    shape = sizejsa(<Matrix>A);
    if ((B instanceof Matrix)) {
      if (!jsaequal(shape, sizejsa(B))) {
        throw new Error('Dimension mismatch');
      }
      
      //both matrix
      mat = zeros(...shape, 'logical');
      var mata = <Matrix>A;
      var matb = <Matrix>B;
      var len = numel(mata);
      for (var i = 1; i <= len; i++) {
        mat.set(i, Number(comp(mata.get(i), matb.get(i))));
      }
    } else {
      //a is mat, b is number
      mat = zeros(...shape, 'logical');
      var mata = <Matrix>A;
      var scalarb = <number>B;
      var len = numel(mata);
      for (var i = 1; i <= len; i++) {
        mat.set(i, Number(comp(mata.get(i), scalarb)));
      }
    }
  } else if (B instanceof Matrix) {
    shape = sizejsa(<Matrix>B);
    // b is mat, a is number
    mat = zeros(...shape, 'logical');
    var scalara = <number>A;
    var matb = B;
    var len = numel(matb);
    for (var i = 1; i <= len; i++) {
      mat.set(i, Number(comp(scalara, matb.get(i))));
    }
  } else {
    //both number
    mat = zeros(1, 'logical');
    mat.set(1, Number(comp(A, B)));
    return mat;
  }

  return mat;
}

export function eq(A: MatrixOrNumber, B: MatrixOrNumber): Matrix {
  return _compare(A, B, (a, b) => { return a == b });
}

export function ge(A: MatrixOrNumber, B: MatrixOrNumber): Matrix {
  return _compare(A, B, (a, b) => { return a >= b });
}

export function gt(A: MatrixOrNumber, B: MatrixOrNumber): Matrix {
  return _compare(A, B, (a, b) => { return a > b });
}

export function le(A: MatrixOrNumber, B: MatrixOrNumber): Matrix {
  return _compare(A, B, (a, b) => { return a <= b });
}

export function lt(A: MatrixOrNumber, B: MatrixOrNumber): Matrix {
  return _compare(A, B, (a, b) => { return a < b });
}

export function ne(A: MatrixOrNumber, B: MatrixOrNumber): Matrix {
  return _compare(A, B, (a, b) => { return a != b });
}

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
