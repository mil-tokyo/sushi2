/// <reference path="../node_modules/definitely-typed-jasmine/jasmine.d.ts" />
import $M = require('../src/sushi');

declare var require;
declare var process;
var cl_enabled = Boolean(Number(process.env['TEST_CL']));
console.log('OpenCL ' + cl_enabled);
if (cl_enabled) {
  var f: typeof $M = require('../src/cl/sushi_cl');
}

describe('Sushi class', function() {
  it('exist Sushi class', function() {
    expect($M).toBeDefined();
  });

  it('zeros', function() {
    var mat = $M.zeros();
    expect(mat._size).toEqual([1, 1]);//1x1 matrix of 0
    expect(mat._klass).toEqual('single');//default type is single (Float32Array)
    expect(mat._data).toEqual(jasmine.any(Float32Array));
    expect(mat._data[0]).toEqual(0);

    mat = $M.zeros(3);//3x3 matrix
    expect(mat._size).toEqual([3, 3]);

    mat = $M.zeros(2, 3);//2x3 matrix
    expect(mat._size).toEqual([2, 3]);
    expect(mat._data.length).toEqual(2 * 3);
    expect(mat._numel).toEqual(6);
    expect(mat._strides).toEqual([1, 2]);
    for (var i = 0; i < mat._data.length; i++) {
      expect(mat._data[i]).toEqual(0);
    }

    mat = $M.zeros(3, 4, 5);//3x4x5 matrix
    expect(mat._size).toEqual([3, 4, 5]);
    expect(mat._data.length).toEqual(3 * 4 * 5);
    expect(mat._numel).toEqual(3 * 4 * 5);
    expect(mat._strides).toEqual([1, 3, 12]);
    for (var i = 0; i < mat._data.length; i++) {
      expect(mat._data[i]).toEqual(0);
    }

    mat = $M.zeros(3, 4, 5, 6);
    expect(mat._size).toEqual([3, 4, 5, 6]);
    
    //zero-dimension case
    mat = $M.zeros(0);
    expect(mat._size).toEqual([0, 0]);
    expect(mat._numel).toEqual(0);

    mat = $M.zeros(0, 0);
    expect(mat._size).toEqual([0, 0]);
    expect(mat._numel).toEqual(0);
    mat = $M.zeros(0, 2);
    expect(mat._size).toEqual([0, 2]);
    expect(mat._numel).toEqual(0);
    mat = $M.zeros(2, 0);
    expect(mat._size).toEqual([2, 0]);
    expect(mat._numel).toEqual(0);
    mat = $M.zeros(2, 2, 0);
    expect(mat._size).toEqual([2, 2, 0]);
    expect(mat._numel).toEqual(0);
    mat = $M.zeros(2, 2, 0, 3);
    expect(mat._size).toEqual([2, 2, 0, 3]);
    expect(mat._numel).toEqual(0);
    
    //tailing 1
    mat = $M.zeros(1);
    expect(mat._size).toEqual([1, 1]);
    expect(mat._numel).toEqual(1);

    mat = $M.zeros(1, 1);
    expect(mat._size).toEqual([1, 1]);
    expect(mat._numel).toEqual(1);

    mat = $M.zeros(1, 1, 1);
    expect(mat._size).toEqual([1, 1]);//at least 2 dims
    expect(mat._numel).toEqual(1);

    mat = $M.zeros(2, 3, 2, 1);
    expect(mat._size).toEqual([2, 3, 2]);
    expect(mat._numel).toEqual(2 * 3 * 2);
    mat = $M.zeros(2, 3, 2, 1, 1);
    expect(mat._size).toEqual([2, 3, 2]);
    expect(mat._numel).toEqual(2 * 3 * 2);
    mat = $M.zeros(2, 3, 2, 1, 2);
    expect(mat._size).toEqual([2, 3, 2, 1, 2]);
    expect(mat._numel).toEqual(2 * 3 * 2 * 2);
    mat = $M.zeros(2, 3, 2, 1, 0);
    expect(mat._size).toEqual([2, 3, 2, 1, 0]);
    expect(mat._numel).toEqual(0);
    
    //TODO: from size matrix
    
    //type specification
    mat = $M.zeros(2, 3, 'single');
    expect(mat._size).toEqual([2, 3]);
    expect(mat._klass).toEqual('single');
    expect(mat._data).toEqual(jasmine.any(Float32Array));
    expect(mat._data[0]).toEqual(0);
    mat = $M.zeros(2, 3, 'uint8');
    expect(mat._size).toEqual([2, 3]);
    expect(mat._klass).toEqual('uint8');
    expect(mat._data).toEqual(jasmine.any(Uint8Array));
    expect(mat._data[0]).toEqual(0);
    mat = $M.zeros(2, 3, 'int32');
    expect(mat._size).toEqual([2, 3]);
    expect(mat._klass).toEqual('int32');
    expect(mat._data).toEqual(jasmine.any(Int32Array));
    expect(mat._data[0]).toEqual(0);
    mat = $M.zeros(2, 3, 'logical');
    expect(mat._size).toEqual([2, 3]);
    expect(mat._klass).toEqual('logical');
    expect(mat._data).toEqual(jasmine.any(Uint8Array));
    expect(mat._data[0]).toEqual(0);

    mat = $M.zeros(2, 3, 'int32');
    mat._data[0] = 10;//change data
    mat = $M.zeros(3, 4, 'like', mat);
    expect(mat._size).toEqual([3, 4]);//only type is copied, not size
    expect(mat._klass).toEqual('int32');
    expect(mat._data).toEqual(jasmine.any(Int32Array));
    expect(mat._data[0]).toEqual(0);//only type is copied, not data
    
    //invalid argument
    expect(() => $M.zeros(-1)).toThrow();//negative
    expect(() => $M.zeros(1.1)).toThrow();//not integer
    expect(() => $M.zeros(2, -1)).toThrow();
    expect(() => $M.zeros(2, 3, -1)).toThrow();
    expect(() => $M.zeros(2, 3, 1.1)).toThrow();
    expect(() => $M.zeros(2, 0, 1.1)).toThrow();
    expect(() => $M.zeros(2, 3, 'foo')).toThrow();//unknown klass
    expect(() => $M.zeros(2, 3, 'like', null)).toThrow();
  });

  it('ones', function() {
    //same as zeros except that content is filled with 1
    var mat = $M.ones();
    expect(mat._size).toEqual([1, 1]);//1x1 matrix of 0
    expect(mat._klass).toEqual('single');//default type is single (Float32Array)
    expect(mat._data).toEqual(jasmine.any(Float32Array));
    expect(mat._data[0]).toEqual(1);

    mat = $M.ones(3);//3x3 matrix
    expect(mat._size).toEqual([3, 3]);

    mat = $M.ones(2, 3);//2x3 matrix
    expect(mat._size).toEqual([2, 3]);
    expect(mat._data.length).toEqual(2 * 3);
    expect(mat._numel).toEqual(6);
    expect(mat._strides).toEqual([1, 2]);
    for (var i = 0; i < mat._data.length; i++) {
      expect(mat._data[i]).toEqual(1);
    }

    mat = $M.ones(3, 4, 5);//3x4x5 matrix
    expect(mat._size).toEqual([3, 4, 5]);

    mat = $M.ones(2, 3, 'uint8');
    expect(mat._size).toEqual([2, 3]);
    expect(mat._klass).toEqual('uint8');
    expect(mat._data).toEqual(jasmine.any(Uint8Array));
    expect(mat._data[0]).toEqual(1);

    mat = $M.ones(2, 3, 'int32');
    mat._data[0] = 10;//change data
    mat = $M.ones(3, 4, 'like', mat);
    expect(mat._size).toEqual([3, 4]);//only type is copied, not size
    expect(mat._klass).toEqual('int32');
    expect(mat._data).toEqual(jasmine.any(Int32Array));
    expect(mat._data[0]).toEqual(1);//only type is copied, not data
  });

  it('valueOf', function() {
    var mat = $M.jsa2mat([[10, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(<any>mat + 0).toEqual(10);
    mat = $M.ones(0, 0);
    expect(<any>mat + 0).toEqual(0);//zero-sized matrix gives 0
  });

  it('get_set_scalar', function() {
    //matrix indexing
    //reference: http://jp.mathworks.com/help/matlab/math/matrix-indexing.html
    //reference:  http://jp.mathworks.com/help/matlab/math/multidimensional-arrays.html
    var mat = $M.zeros(2, 3);
    expect(mat.get(1, 1)).toEqual(0);
    //[10 30 50;20 40 60]
    mat.set(1, 1, 10);
    mat.set(2, 1, 20);
    mat.set(1, 2, 30);
    mat.set($M.end, 2, 40);//final index of a dimension
    mat.set(1, $M.end, 50);
    mat.set(2, 3, 60);
    expect(mat.get(1, 1)).toEqual(10);
    expect(mat.get(2, 1)).toEqual(20);
    expect(mat.get(1, 2)).toEqual(30);
    expect(mat.get(2, 2)).toEqual(40);
    expect(mat.get(1, 3)).toEqual(50);
    expect(mat.get(2, 3)).toEqual(60);
    expect(mat.get($M.end, 2)).toEqual(40);
    expect(mat.get(1, $M.end)).toEqual(50);
    expect(mat.get(1, $M.end - 1)).toEqual(30);
    expect(mat.get(1)).toEqual(10);//linear indexing
    expect(mat.get(2)).toEqual(20);
    expect(mat.get(3)).toEqual(30);
    expect(mat.get(4)).toEqual(40);
    expect(mat.get(5)).toEqual(50);
    expect(mat.get(6)).toEqual(60);
    mat.set(3, 31);
    expect(mat.get(3)).toEqual(31);
    expect(mat.get(1, 2)).toEqual(31);
    mat.set($M.end, 61);
    expect(mat.get($M.end, $M.end)).toEqual(61);
    expect(mat.get(2, 3)).toEqual(61);
    expect(mat.get($M.end)).toEqual(61);
    mat.set($M.end - 2, 41);
    expect(mat.get(4)).toEqual(41);
    expect(mat.get($M.end - 2)).toEqual(41);
    expect($M.end).toEqual(-1);//end is same as -1
    
    mat = $M.zeros(3, 4, 5);
    mat.set(1, 2, 3, 10);
    expect(mat.get(1, 2, 3)).toEqual(10);
    expect(mat.get(0 + 1 * 3 + 2 * 3 * 4 + 1)).toEqual(10);
    expect(mat.get(1, 2, 3, 1, 1)).toEqual(10);//extra 1 is ok
    expect(mat.get(1, 2, 3, 1, $M.end)).toEqual(10);//extra end is ok
    mat.set(2, 3, 20);//1 is expected for omitted dimension
    expect(mat.get(2, 3)).toEqual(20);
    expect(mat.get(2, 3, 1)).toEqual(20);
    expect(mat.get(1 + 2 * 3 + 1)).toEqual(20);
    expect(mat.get($M.end - 1, $M.end - 1)).toEqual(20);
    
    //logical value
    //in typedarray, inputting false becomes 0, true becomes 1
    //false==0, false!==0, true==1, true!==1
    mat = $M.zeros(2, 3, 'logical');
    mat.set(1, 1, true);
    expect(mat.get(1, 1)).toEqual(1);
    mat.set(1, 1, false);
    expect(mat.get(1, 1)).toEqual(0);
    mat.set(1, 1, 2);
    expect(mat.get(1, 1)).toEqual(1);//converted to 0/1
    
    //invalid index
    mat = $M.zeros(0, 0);
    expect(() => mat.get(1)).toThrow();//any index is error
    expect(() => mat.get(1, 1)).toThrow();
    expect(() => mat.get($M.end)).toThrow();
    expect(() => mat.set(1, 1)).toThrow();//any index is error
    expect(() => mat.set(1, 1, 1)).toThrow();
    expect(() => mat.set($M.end, 1)).toThrow();
    mat = $M.zeros(2, 3);
    expect(() => mat.get(0)).toThrow();
    expect(() => mat.get(7)).toThrow();
    expect(() => mat.get(3, 1)).toThrow();
    expect(() => mat.get(1, 4)).toThrow();
    expect(() => mat.get(1, 1, 2)).toThrow();
    expect(() => mat.get($M.end - 6)).toThrow();
    expect(() => mat.get($M.end - 7)).toThrow();
    mat = $M.zeros(3, 4, 5);
    expect(() => mat.get(1, 1, 6)).toThrow();
    
    //TODO: automatic expansion of multidimensional matrix
  });

  it('get_set_matrix', function() {
    var mat = $M.jsa2mat([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    var mat2: $M.Matrix;
    var extracted: $M.Matrix;
    
    //linear indexing
    extracted = mat.get($M.colon(2, 5));
    expect($M.mat2jsa(extracted)).toEqual([[4, 7, 2, 5]]);
    extracted = mat.get($M.colon(2, 3, 8));
    expect($M.mat2jsa(extracted)).toEqual([[4, 5, 6]]);
    extracted = mat.get($M.jsa2mat([]));
    expect($M.mat2jsa(extracted)).toEqual([]);
    extracted = mat.get($M.jsa2mat([1, 3, 9]));
    expect($M.mat2jsa(extracted)).toEqual([[1, 7, 9]]);
    extracted = mat.get($M.jsa2mat([1, 3, 9], true));//column vector
    expect($M.mat2jsa(extracted)).toEqual([[1], [7], [9]]);
    extracted = mat.get($M.jsa2mat([[1, 3, 9], [2, 4, 1]]));//matrix of linear index
    expect($M.mat2jsa(extracted)).toEqual([[1, 7, 9], [4, 2, 1]]);
    extracted = mat.get($M.colon());//all
    expect($M.mat2jsa(extracted)).toEqual([[1, 4, 7, 2, 5, 8, 3, 6, 9]]);
    mat2 = mat.copy();
    mat2.set($M.jsa2mat([1, 3, 5]), 10);
    expect($M.mat2jsa(mat2)).toEqual([[10, 2, 3], [4, 10, 6], [10, 8, 9]]);
    mat2 = mat.copy();
    mat2.set($M.jsa2mat([1, 3, 5]), $M.jsa2mat([10]));
    expect($M.mat2jsa(mat2)).toEqual([[10, 2, 3], [4, 10, 6], [10, 8, 9]]);
    mat2 = mat.copy();
    mat2.set($M.jsa2mat([1, 3, 5]), $M.jsa2mat([10, 20, 30]));
    expect($M.mat2jsa(mat2)).toEqual([[10, 2, 3], [4, 30, 6], [20, 8, 9]]);
    
    
    //2-d indexing
    extracted = mat.get($M.colon(2, 3), $M.colon(1, 2));
    expect($M.mat2jsa(extracted)).toEqual([[4, 5], [7, 8]]);
    extracted = mat.get($M.colon(), 2);
    expect($M.mat2jsa(extracted)).toEqual([[2], [5], [8]]);
    extracted = mat.get($M.colon(), $M.colon());
    expect($M.mat2jsa(extracted)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    var logical_index = $M.gt(mat, 7);
    extracted = mat.get(logical_index);
    expect($M.mat2jsa(extracted)).toEqual([[8], [9]]);
    mat2 = mat.copy();
    mat2.set(logical_index, 10);
    expect($M.mat2jsa(mat2)).toEqual([[1, 2, 3], [4, 5, 6], [7, 10, 10]]);
    mat2 = mat.copy();
    mat2.set($M.colon(1, 2), $M.colon(2, 3), 10);
    expect($M.mat2jsa(mat2)).toEqual([[1, 10, 10], [4, 10, 10], [7, 8, 9]]);
    mat2 = mat.copy();
    mat2.set($M.colon(1, 2), $M.colon(2, 3), $M.jsa2mat([[10, 20], [30, 40]]));
    expect($M.mat2jsa(mat2)).toEqual([[1, 10, 20], [4, 30, 40], [7, 8, 9]]);
    
    
    
    //TODO: n-d matrix
  });

  it('size and related', function() {
    //size, length, ndims, numel, iscolumn, isempty, ismatrix, isrow, isscalar, isvector
    var mat = $M.zeros(2, 3);
    expect($M.size(mat, 1)).toEqual(2);
    expect($M.size(mat, 2)).toEqual(3);
    expect($M.size(mat, 3)).toEqual(1);//extra dimension is 1
    expect($M.size(mat)._size).toEqual([1, 2]);//row vector
    expect($M.size(mat).mat2jsa(false)).toEqual([[2, 3]]);
    expect($M.length(mat)).toEqual(3);//largest dimension
    expect($M.ndims(mat)).toEqual(2);
    expect($M.numel(mat)).toEqual(6);

    mat = $M.zeros(4, 3, 2);
    expect($M.size(mat, 1)).toEqual(4);
    expect($M.size(mat, 2)).toEqual(3);
    expect($M.size(mat, 3)).toEqual(2);
    expect($M.size(mat, 4)).toEqual(1);//extra dimension is 1
    expect($M.size(mat)._size).toEqual([1, 3]);//row vector
    expect($M.size(mat).mat2jsa(false)).toEqual([[4, 3, 2]]);
    expect($M.length(mat)).toEqual(4);//largest dimension
    expect($M.ndims(mat)).toEqual(3);
    expect($M.numel(mat)).toEqual(24);

    var ischeck = function(shape: number[], iscolumn: boolean, isrow: boolean, isvector: boolean, ismatrix: boolean, isscalar: boolean, isempty: boolean) {
      var m = $M.zeros(...shape);
      expect($M.iscolumn(m)).toEqual(iscolumn);
      expect($M.isrow(m)).toEqual(isrow);
      expect($M.isvector(m)).toEqual(isvector);
      expect($M.ismatrix(m)).toEqual(ismatrix);
      expect($M.isscalar(m)).toEqual(isscalar);
      expect($M.isempty(m)).toEqual(isempty);
    }

    ischeck([2, 1], true, false, true, true, false, false);
    ischeck([1, 2], false, true, true, true, false, false);
    ischeck([2, 3], false, false, false, true, false, false);
    ischeck([2, 0], false, false, false, true, false, true);
    ischeck([0, 2], false, false, false, true, false, true);
    ischeck([0, 0], false, false, false, true, false, true);
    ischeck([1, 0], false, true, true, true, false, true);
    ischeck([0, 1], true, false, true, true, false, true);
    ischeck([1, 1], true, true, true, true, true, false);
    ischeck([1, 2, 3], false, false, false, false, false, false);
    ischeck([2, 1, 3], false, false, false, false, false, false);
    ischeck([1, 2, 0], false, false, false, false, false, true);
    ischeck([2, 1, 0], false, false, false, false, false, true);

  });

  it('jsa2mat', function() {
    var ary = [];//0x0
    var mat = $M.jsa2mat(ary);
    expect(mat._size).toEqual([0, 0]);

    ary = [[1, 2, 3], [4, 5, 6]];
    mat = $M.jsa2mat(ary);
    expect(mat._size).toEqual([2, 3]);
    expect(mat.get(1, 1)).toEqual(1);
    expect(mat.get(1, 2)).toEqual(2);
    expect(mat.get(1, 3)).toEqual(3);
    expect(mat.get(2, 1)).toEqual(4);
    expect(mat.get(2, 2)).toEqual(5);
    expect(mat.get(2, 3)).toEqual(6);

    ary = [10, 20, 30];
    mat = $M.jsa2mat(ary, true);//column vector
    expect(mat._size).toEqual([3, 1]);
    expect(mat.get(1, 1)).toEqual(10);
    expect(mat.get(2, 1)).toEqual(20);
    expect(mat.get(3, 1)).toEqual(30);
    mat = $M.jsa2mat(ary, false);//row vector
    expect(mat._size).toEqual([1, 3]);
    expect(mat.get(1, 1)).toEqual(10);
    expect(mat.get(1, 2)).toEqual(20);
    expect(mat.get(1, 3)).toEqual(30);
    
    // TODO: support of n-d array
  });

  it('mat2jsa', function() {
    var mat = $M.zeros(2, 3);
    //[10 30 50;20 40 60]
    mat.set(1, 1, 10);
    mat.set(2, 1, 20);
    mat.set(1, 2, 30);
    mat.set(2, 2, 40);//final index of a dimension
    mat.set(1, 3, 50);
    mat.set(2, 3, 60);
    expect($M.mat2jsa(mat)).toEqual([[10, 30, 50], [20, 40, 60]]);

    mat = $M.zeros(3, 1);
    mat.set(1, 10);
    mat.set(2, 20);
    mat.set(3, 30);
    expect($M.mat2jsa(mat, false)).toEqual([[10], [20], [30]]);
    expect($M.mat2jsa(mat, true)).toEqual([10, 20, 30]);
    mat = $M.zeros(1, 3);
    mat.set(1, 10);
    mat.set(2, 20);
    mat.set(3, 30);
    expect($M.mat2jsa(mat, false)).toEqual([[10, 20, 30]]);
    expect($M.mat2jsa(mat, true)).toEqual([10, 20, 30]);

    mat = $M.zeros(0, 0);
    expect($M.mat2jsa(mat)).toEqual([]);
    mat = $M.zeros(2, 0);
    expect($M.mat2jsa(mat)).toEqual([[], []]);
    mat = $M.zeros(0, 2);
    expect($M.mat2jsa(mat)).toEqual([]);//limitation of representation ability
    
    //TODO: support of n-d array
  });

  it('comparison', function() {
    //eq, ge, gt, le, lt, ne, isequal, isequaln
    var check = function(op, a, b, expected, expected_size, gpu) {
      if (Array.isArray(a)) {
        a = $M.jsa2mat(a);
        if (gpu) {
          a = $M.gpuArray(a);
        }
      }
      if (Array.isArray(b)) {
        b = $M.jsa2mat(b);
        if (gpu) {
          b = $M.gpuArray(b);
        }
      }
      var res = op(a, b);
      expect($M.klass(res)).toEqual('logical');
      if (expected_size) {
        expect($M.sizejsa(res)).toEqual(expected_size);
      }
      expect(res.mat2jsa()).toEqual(expected);
    }

    var check_allop = function(a, b, expected_eq, expected_ge,
      expected_gt, expected_le, expected_lt, expected_ne, expected_size) {
      for (var gpu = 0; gpu < 2; gpu++) {
        check($M.eq, a, b, expected_eq, expected_size, gpu == 1);
        check($M.ge, a, b, expected_ge, expected_size, gpu == 1);
        check($M.gt, a, b, expected_gt, expected_size, gpu == 1);
        check($M.le, a, b, expected_le, expected_size, gpu == 1);
        check($M.lt, a, b, expected_lt, expected_size, gpu == 1);
        check($M.ne, a, b, expected_ne, expected_size, gpu == 1);
      }
    }
    check($M.eq, [2, 3], [2, 4], [[1, 0]], [1, 2], false);
    check($M.eq, [2, 3], [2, 4], [[1, 0]], [1, 2], true);
    check_allop([2, 3, 4], [4, 3, 2], [[0, 1, 0]], [[0, 1, 1]], [[0, 0, 1]], [[1, 1, 0]], [[1, 0, 0]], [[1, 0, 1]], [1, 3]);
    check_allop([2, 3, 4], 2.5, [[0, 0, 0]], [[0, 1, 1]], [[0, 1, 1]], [[1, 0, 0]], [[1, 0, 0]], [[1, 1, 1]], [1, 3]);
    check_allop(3.5, [2, 3, 4], [[0, 0, 0]], [[1, 1, 0]], [[1, 1, 0]], [[0, 0, 1]], [[0, 0, 1]], [[1, 1, 1]], [1, 3]);
    check_allop(1.0, 2.0, [[0]], [[0]], [[0]], [[1]], [[1]], [[1]], [1, 1]);
    check_allop(20, 20, [[1]], [[1]], [[0]], [[1]], [[0]], [[0]], [1, 1]);
    check_allop(50, -10, [[0]], [[1]], [[1]], [[0]], [[0]], [[1]], [1, 1]);
    check_allop([NaN, Infinity, -Infinity, 1.0], [NaN, Infinity, -Infinity, 1.0 + 1.0e-6],
      [[0, 1, 1, 0]], [[0, 1, 1, 0]], [[0, 0, 0, 0]], [[0, 1, 1, 1]], [[0, 0, 0, 1]], [[1, 0, 0, 1]], [1, 4]);

    var a = $M.jsa2mat([0, 1, 2]);
    var b = $M.jsa2mat([0, 1, 1], false, 'logical');
    var res = $M.eq(a, b);
    expect(res.mat2jsa(true)).toEqual([1, 1, 0]);//compared as number
    
    //invalid shape
    expect(() => $M.eq($M.zeros(1, 2), $M.zeros(1, 3))).toThrow();
  });

  it('isequal', function() {
    var check = function(mats_jsa, expected_equal, expected_equaln) {
      var mats = mats_jsa.map((m) => $M.jsa2mat(m));
      expect($M.isequal.apply(null, mats)).toEqual(expected_equal);
      expect($M.isequaln.apply(null, mats)).toEqual(expected_equaln);
      mats = mats.map((m) => $M.gpuArray(m));
      expect($M.isequal.apply(null, mats)).toEqual(expected_equal);
      expect($M.isequaln.apply(null, mats)).toEqual(expected_equaln);
    };

    expect($M.isequal(<any>1, <any>1)).toEqual(false);//number is not accepted
    check([[[1, 2, 3]], [1, 2, 3]], true, true);
    check([[[0]], [[0]]], true, true);
    check([[[1, 2, 3]], [[1, 2]]], false, false);
    check([[[NaN, 2, 3]], [[NaN, 2, 3]]], false, true);
    check([[[NaN, 2, 3]], [[1, 2, 3]]], false, false);
    check([[[1.1, 2, 3]], [[1, 2, 3]]], false, false);
  });

  it('binary_operation', function() {
    var mata = $M.jsa2mat([1, 2, 3]);
    var matb = $M.jsa2mat([2, 8, 15]);
    expect($M.mat2jsa($M.plus(mata, matb))).toEqual([[3, 10, 18]]);
    expect($M.mat2jsa($M.minus(mata, matb))).toEqual([[-1, -6, -12]]);
    expect($M.mat2jsa($M.times(mata, matb))).toEqual([[2, 16, 45]]);
    expect($M.mat2jsa($M.rdivide(matb, mata))).toEqual([[2, 4, 5]]);
    expect($M.mat2jsa($M.ldivide(mata, matb))).toEqual([[2, 4, 5]]);
    expect($M.mat2jsa($M.power(matb, mata))).toEqual([[2, 64, 15 * 15 * 15]]);
  });

  it('gpuArray', function() {
    var cpu = $M.jsa2mat([1, 3, 5]);
    var gpu = $M.gpuArray(cpu);
    var again_cpu = $M.gather(gpu);
    expect($M.mat2jsa(again_cpu)).toEqual([[1, 3, 5]]);
    expect(gpu.get(2)).toEqual(3);
    var gpu2 = gpu.copy();
    gpu.set(1, 10);
    gpu.set(3, 30);
    gpu.set(2, 20);
    expect($M.mat2jsa(gpu)).toEqual([[10, 20, 30]]);
    expect($M.mat2jsa(gpu2)).toEqual([[1, 3, 5]]);
    gpu.destruct();

    var mat = $M.gpuArray($M.jsa2mat([[1, 2, 3], [4, 5, 6], [7, 8, 9]]));
    var mat2: $M.Matrix;
    var extracted: $M.Matrix;
    
    //linear indexing
    extracted = mat.get($M.colon(2, 5));
    expect($M.mat2jsa(extracted)).toEqual([[4, 7, 2, 5]]);
    extracted = mat.get($M.colon(2, 3, 8));
    expect($M.mat2jsa(extracted)).toEqual([[4, 5, 6]]);
    extracted = mat.get($M.jsa2mat([]));
    expect($M.mat2jsa(extracted)).toEqual([]);
    extracted = mat.get($M.jsa2mat([1, 3, 9]));
    expect($M.mat2jsa(extracted)).toEqual([[1, 7, 9]]);
    extracted = mat.get($M.jsa2mat([1, 3, 9], true));//column vector
    expect($M.mat2jsa(extracted)).toEqual([[1], [7], [9]]);
    extracted = mat.get($M.jsa2mat([[1, 3, 9], [2, 4, 1]]));//matrix of linear index
    expect($M.mat2jsa(extracted)).toEqual([[1, 7, 9], [4, 2, 1]]);
    extracted = mat.get($M.colon());//all
    expect($M.mat2jsa(extracted)).toEqual([[1, 4, 7, 2, 5, 8, 3, 6, 9]]);
    mat2 = mat.copy();
    mat2.set($M.jsa2mat([1, 3, 5]), 10);
    expect($M.mat2jsa(mat2)).toEqual([[10, 2, 3], [4, 10, 6], [10, 8, 9]]);
    mat2 = mat.copy();
    mat2.set($M.jsa2mat([1, 3, 5]), $M.jsa2mat([10]));
    expect($M.mat2jsa(mat2)).toEqual([[10, 2, 3], [4, 10, 6], [10, 8, 9]]);
    mat2 = mat.copy();
    mat2.set($M.jsa2mat([1, 3, 5]), $M.jsa2mat([10, 20, 30]));
    expect($M.mat2jsa(mat2)).toEqual([[10, 2, 3], [4, 30, 6], [20, 8, 9]]);
    
    
    //2-d indexing
    extracted = mat.get($M.colon(2, 3), $M.colon(1, 2));
    expect($M.mat2jsa(extracted)).toEqual([[4, 5], [7, 8]]);
    extracted = mat.get($M.colon(), 2);
    expect($M.mat2jsa(extracted)).toEqual([[2], [5], [8]]);
    extracted = mat.get($M.colon(), $M.colon());
    expect($M.mat2jsa(extracted)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    var logical_index = $M.gt($M.gather(mat), 7);//TODO: both on cpu/gpu
    extracted = mat.get(logical_index);
    expect($M.mat2jsa(extracted)).toEqual([[8], [9]]);
    mat2 = mat.copy();
    mat2.set(logical_index, 10);
    expect($M.mat2jsa(mat2)).toEqual([[1, 2, 3], [4, 5, 6], [7, 10, 10]]);
    mat2 = mat.copy();
    mat2.set($M.colon(1, 2), $M.colon(2, 3), 10);
    expect($M.mat2jsa(mat2)).toEqual([[1, 10, 10], [4, 10, 10], [7, 8, 9]]);
    mat2 = mat.copy();
    mat2.set($M.colon(1, 2), $M.colon(2, 3), $M.jsa2mat([[10, 20], [30, 40]]));
    expect($M.mat2jsa(mat2)).toEqual([[1, 10, 20], [4, 30, 40], [7, 8, 9]]);
  });

  it('binary_operation_gpu', function() {
    var mata = $M.gpuArray($M.jsa2mat([1, 2, 3]));
    var matb = $M.jsa2mat([2, 8, 15]);
    expect($M.mat2jsa($M.plus(mata, matb))).toEqual([[3, 10, 18]]);
    expect($M.mat2jsa($M.minus(mata, matb))).toEqual([[-1, -6, -12]]);
    expect($M.mat2jsa($M.times(mata, matb))).toEqual([[2, 16, 45]]);
    expect($M.mat2jsa($M.rdivide(matb, mata))).toEqual([[2, 4, 5]]);
    expect($M.mat2jsa($M.ldivide(mata, matb))).toEqual([[2, 4, 5]]);
    expect($M.mat2jsa($M.power(matb, mata))).toEqual([[2, 64, 15 * 15 * 15]]);
    expect($M.mat2jsa($M.plus(mata, 1))).toEqual([[2, 3, 4]]);
    expect($M.mat2jsa($M.plus(2, mata))).toEqual([[3, 4, 5]]);
    var matscalar = $M.gpuArray($M.jsa2mat([5]));
    expect($M.mat2jsa($M.plus(mata, matscalar))).toEqual([[6, 7, 8]]);
    expect($M.mat2jsa($M.plus(mata, mata))).toEqual([[2, 4, 6]]);
  });

  it('reshape', function() {
    var mat = $M.jsa2mat([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]);//12 elements
    mat.reshape_inplace(3, 4);
    //value is preserved in fortran-order
    expect($M.isequal(mat, $M.jsa2mat([[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]]))).toBeTruthy();
    mat.reshape_inplace(3, 2, 2);
    expect(mat.get(2, 1, 2)).toEqual(8);
    mat.reshape_inplace(1, 2, 3, 2);
    expect($M.sizejsa(mat)).toEqual([1, 2, 3, 2]);
    mat.reshape_inplace([2, 6]);//number array accepted
    expect($M.sizejsa(mat)).toEqual([2, 6]);
    mat.reshape_inplace($M.jsa2mat([6, 2]));//vector accepted
    expect($M.sizejsa(mat)).toEqual([6, 2]);
    mat.reshape_inplace(-1, 1);
    expect($M.sizejsa(mat)).toEqual([12, 1]);
    mat.reshape_inplace(4, 1, -1);
    expect($M.sizejsa(mat)).toEqual([4, 1, 3]);
    mat.reshape_inplace(4, 3, -1);
    expect($M.sizejsa(mat)).toEqual([4, 3]);//final 1 is omitted
    mat.reshape_inplace(12, -1);
    expect($M.sizejsa(mat)).toEqual([12, 1]);

    expect(() => mat.reshape_inplace(1, 1)).toThrow();
    expect(() => mat.reshape_inplace(5, -1)).toThrow();
    expect(() => mat.reshape_inplace(5, 0)).toThrow();
    expect(() => mat.reshape_inplace(1.2, 10)).toThrow();

    var mat2 = $M.reshape(mat, 3, 4);
    expect($M.sizejsa(mat2)).toEqual([3, 4]);
    mat2 = $M.reshape(mat, [2, 3, -1]);
    expect($M.sizejsa(mat2)).toEqual([2, 3, 2]);
  });
});
