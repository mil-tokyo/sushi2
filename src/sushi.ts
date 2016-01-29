export import Matrix = require('./matrix');

export var end = -1;

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
