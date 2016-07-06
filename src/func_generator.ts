import Matrix = require('./matrix');
import util = require('./util');

export type MatrixOrNumber = util.MatrixOrNumber;
export function make_compare_func_all(operation: string): (A: MatrixOrNumber, B: MatrixOrNumber) => Matrix {
  var func_s_s = make_binary_arith_func(operation, false, false, 'logical');
  var func_s_m = make_binary_arith_func(operation, false, true, 'logical');
  var func_m_s = make_binary_arith_func(operation, true, false, 'logical');
  var func_m_m = make_binary_arith_func(operation, true, true, 'logical');
  return function(A: MatrixOrNumber, B: MatrixOrNumber) {
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

export function make_binary_arith_func(operation: string, a_mat: boolean, b_mat: boolean, dst_klass: string): (A: MatrixOrNumber, B: MatrixOrNumber) => Matrix {
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

export function make_binary_arith_func_all(operation: string): (A: MatrixOrNumber, B: MatrixOrNumber) => Matrix {
  var funcs = {};
  return function(A: MatrixOrNumber, B: MatrixOrNumber) {
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
  }
}

export function make_unary_arith_func(operation: string, a_mat: boolean, dst_klass: string): (A: MatrixOrNumber) => Matrix {
  var l_shape: string;
  var l_def_adata = '';
  var l_get_a;
  if (a_mat) {
    l_shape = 'A._size';
    l_def_adata = 'var a_data = A._data;';
    l_get_a = 'a_data[i]';
  } else {
    l_shape = '[1,1]';
    l_get_a = 'A';
  }

  var l_opr_formatted = operation.replace(/%a/g, l_get_a);

  var f: any;
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

export function make_unary_arith_func_all(operation: string): (A: MatrixOrNumber) => Matrix {
  var funcs = {};
  return function(A: MatrixOrNumber) {
    var dst_klass;
    if (A instanceof Matrix) {
      dst_klass = A._klass;
      if (dst_klass == 'logical') {
        dst_klass = 'single';
      }
    } else {
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
  }
}

function isequal_two(A: Matrix, B: Matrix): boolean {
  A = A.to_cpu();
  B = B.to_cpu();
  if (!util.issamesize(A._size, B._size)) {
    return false;
  }

  //(1,1)=>true,(NaN,NaN)=>false,(NaN,1)=>false
  var a_data = A._data;
  var b_data = B._data;
  for (var i = 0, length = a_data.length; i < length; i++) {
    if (a_data[i] !== b_data[i]) {//both are value or include NaN
      // NaN !== NaN
      return false;
    }
  }

  return true;
}

export function isequal(...As: Matrix[]): boolean {
  if (!(As[0] instanceof Matrix)) { return false; }//scalar is not allowed
  for (var i = 1; i < As.length; i++) {
    if (!(As[i] instanceof Matrix)) { return false; }
    if (!isequal_two(As[0], As[i])) {
      return false;
    }
  }

  return true;
}

function isequaln_two(A: Matrix, B: Matrix): boolean {
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
      if ((val_a === val_a) || (val_b === val_b)) {//false if both are NaN
        return false;
      }
    }
  }

  return true;
}

export function isequaln(...As: Matrix[]): boolean {
  if (!(As[0] instanceof Matrix)) { return false; }//scalar is not allowed
  for (var i = 1; i < As.length; i++) {
    if (!(As[i] instanceof Matrix)) { return false; }
    if (!isequaln_two(As[0], As[i])) {
      return false;
    }
  }

  return true;
}


function make_isclose_func_all(): (A: MatrixOrNumber, B: MatrixOrNumber, rtol?: number, atol?: number, equal_nan?: boolean) => Matrix {
  var func_s_s = make_isclose_func(false, false);
  var func_s_m = make_isclose_func(false, true);
  var func_m_s = make_isclose_func(true, false);
  var func_m_m = make_isclose_func(true, true);
  return function(A: MatrixOrNumber, B: MatrixOrNumber, rtol: number = 1e-5, atol: number = 1e-8, equal_nan: boolean = false) {
    A = util.force_cpu_scalar(A);
    B = util.force_cpu_scalar(B);
    if (A instanceof Matrix) {
      if (B instanceof Matrix) {
        return func_m_m(A, B, rtol, atol, equal_nan);
      } else {
        return func_m_s(A, B, rtol, atol, equal_nan);
      }
    } else {
      if (B instanceof Matrix) {
        return func_s_m(A, B, rtol, atol, equal_nan);
      } else {
        return func_s_s(A, B, rtol, atol, equal_nan);
      }
    }
  }
}

export function make_isclose_func(a_mat: boolean, b_mat: boolean): (A: MatrixOrNumber, B: MatrixOrNumber, rtol?: number, atol?: number, equal_nan?: boolean) => Matrix {
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

  var f: any;
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

export var isclose = make_isclose_func_all();

export function allclose(A: MatrixOrNumber, B: MatrixOrNumber, rtol?: number, atol?: number, equal_nan?: boolean): boolean {
  var isclose_result = isclose(A, B, rtol, atol, equal_nan);
  var data = isclose_result.getdataref();
  var prod = 1;
  for (var i = 0; i < data.length; i++) {
    prod *= data[i];
  }

  return prod != 0;
}
