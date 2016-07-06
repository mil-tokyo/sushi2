/// <reference path="../node_modules/definitely-typed-jasmine/jasmine.d.ts" />
import $M = require('../src/sushi');

declare var require;
declare var process;
declare var Buffer;
var os = require('os');
var fs = require('fs');
var child_process = require('child_process');
var cl_enabled = Boolean(Number(process.env['TEST_CL']));
console.log('OpenCL ' + cl_enabled);
var MatrixCL = null;
if (cl_enabled) {
  $M.initcl();
  MatrixCL = require('../src/cl/matrix_cl');
}

describe('Sushi class', function () {
  it('exist Sushi class', function () {
    expect($M).toBeDefined();
  });

  it('zeros', function () {
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

    if (MatrixCL) {
      var matg = $M.zeros(2, 3, 'gpuArray');
      expect(matg instanceof MatrixCL).toBeTruthy();
      expect(matg._size).toEqual([2, 3]);
      expect(matg.get(1)).toEqual(0);
      expect(matg.get(6)).toEqual(0);
    }
  });

  it('ones', function () {
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


    if (MatrixCL) {
      var matg = $M.ones(2, 3, 'gpuArray');
      expect(matg instanceof MatrixCL).toBeTruthy();
      expect(matg._size).toEqual([2, 3]);
      expect(matg.get(1)).toEqual(1);
      expect(matg.get(6)).toEqual(1);
    }
  });

  it('eye', function () {
    var mat = $M.eye();
    expect(mat._size).toEqual([1, 1]);
    expect($M.mat2jsa(mat)).toEqual([[1]]);
    mat = $M.eye(4);
    expect($M.mat2jsa(mat)).toEqual([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
    mat = $M.eye(3, 4);
    expect($M.mat2jsa(mat)).toEqual([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]);
  });

  it('typedarray2mat', function () {
    expect(() => $M.typedarray2mat([1, 2], 'single', new Uint8Array(2))).toThrow();//type mismatch
    expect(() => $M.typedarray2mat([2, 2], 'single', new Float32Array(2))).toThrow();//size insufficient
    expect(() => $M.typedarray2mat([2, 2], 'single', new Float32Array(10))).not.toThrow();//size exceed
    var mat = $M.typedarray2mat([2, 3], 'int32', new Int32Array([10, 20, 30, 40, 50, 60]));
    expect(mat.get(2, 1)).toEqual(20);
    expect(mat.get(2, 3)).toEqual(60);
    mat = $M.typedarray2mat([5, 1], 'logical', new Uint8Array([0, 1, 2, 3, 4]));
    expect(mat.get(1)).toEqual(0);
    expect(mat.get(2)).toEqual(1);
    expect(mat.get(5)).toEqual(1);//converted to 1
  });

  it('valueOf', function () {
    var mat = $M.jsa2mat([[10, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(<any>mat + 0).toEqual(10);
    mat = $M.ones(0, 0);
    expect(<any>mat + 0).toEqual(0);//zero-sized matrix gives 0
  });

  it('get_set_scalar', function () {
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

  it('get_set_matrix', function () {
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
    mat2.set($M.colon(), 5);//all
    expect($M.mat2jsa(mat2)).toEqual([[5, 5, 5], [5, 5, 5], [5, 5, 5]]);
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

  it('size and related', function () {
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

    var ischeck = function (shape: number[], iscolumn: boolean, isrow: boolean, isvector: boolean, ismatrix: boolean, isscalar: boolean, isempty: boolean) {
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

  it('jsa2mat', function () {
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

    ary = [[[10, 20, 30], [40, 50, 60]], [[70, 80, 90], [100, 110, 120]]];
    mat = $M.jsa2mat(ary);
    expect(mat._size).toEqual([2, 2, 3]);
    expect(mat.get(1, 1, 1)).toEqual(ary[0][0][0]);
    expect(mat.get(2, 1, 2)).toEqual(ary[1][0][1]);

    ary = [[[[10, 20, 30], [40, 50, 60]], [[70, 80, 90], [100, 110, 120]]]];
    mat = $M.jsa2mat(ary);
    expect(mat._size).toEqual([1, 2, 2, 3]);
    expect(mat.get(1, 1, 1, 1)).toEqual(ary[0][0][0][0]);
    expect(mat.get(1, 2, 1, 2)).toEqual(ary[0][1][0][1]);

    ary = [[[10, 20, 30], [40, 50, 60]], [[70, 80, 90], [100, 110]]];
    expect(() => $M.jsa2mat(ary)).toThrow();

    ary = [[[10], [40]], [[70], [100]]];//[2][2][1]
    mat = $M.jsa2mat(ary);
    expect(mat._size).toEqual([2, 2]);
    expect(mat.get(2, 1)).toEqual(ary[1][0][0]);

    mat = $M.jsa2mat(<any>10);
    expect(mat._size).toEqual([1, 1]);
    expect(mat.get(1)).toEqual(10);


    ary = [[1.1, 2, 3], [4, 5, 6]];
    mat = $M.jsa2mat(ary, true, 'int32');
    expect(mat._size).toEqual([2, 3]);
    expect(mat._klass).toEqual('int32');
    expect(mat.get(1, 1)).toEqual(1);
    expect(mat.get(1, 2)).toEqual(2);
    expect(mat.get(1, 3)).toEqual(3);
    expect(mat.get(2, 1)).toEqual(4);
    expect(mat.get(2, 2)).toEqual(5);
    expect(mat.get(2, 3)).toEqual(6);

    mat = $M.jsa2mat([2, 0], false, 'logical');
    expect(mat._size).toEqual([1, 2]);
    expect(mat._klass).toEqual('logical');
    expect(mat.get(1, 1)).toEqual(1);
    expect(mat.get(1, 2)).toEqual(0);
  });

  it('mat2jsa', function () {
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

    mat = $M.rand(2, 3, 4);
    var jsa = $M.mat2jsa(mat);
    expect(jsa.length).toEqual(2);
    expect(jsa[0].length).toEqual(3);
    expect(jsa[0][0].length).toEqual(4);
    expect(jsa[0][0][0]).toEqual(mat.get(1, 1, 1));
    expect(jsa[1][0][1]).toEqual(mat.get(2, 1, 2));
    expect(jsa[1][2][3]).toEqual(mat.get(2, 3, 4));

    mat = $M.zeros(2, 3, 0);
    expect($M.mat2jsa(mat)).toEqual([[[], [], []], [[], [], []]]);
  });

  it('comparison', function () {
    //eq, ge, gt, le, lt, ne, isequal, isequaln, isclose, allclose
    var check = function (op, a, b, expected, expected_size, gpu) {
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

    var check_allop = function (a, b, expected_eq, expected_ge,
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

  it('isequal', function () {
    var check = function (mats_jsa, expected_equal, expected_equaln) {
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

    //nearly equal (as in numpy)
    var check_nearlyequal = function (a, b, expected_isclose, expected_allclose, rtol, atol, equal_nan) {
      var mata = $M.jsa2mat(a);
      var matb = $M.jsa2mat(b);
      expect($M.mat2jsa($M.isclose(mata, matb, rtol, atol, equal_nan))).toEqual(expected_isclose);
      expect($M.allclose(mata, matb, rtol, atol, equal_nan)).toEqual(expected_allclose);
    }

    //default rtol = 1e-5, atol = 1e-8
    check_nearlyequal([1e10, 1e-7], [1.000009e10, 1e-8], [[1, 0]], false, undefined, undefined, undefined);
    check_nearlyequal([1e10, 1e-7], [1.000020e10, 1e-8], [[0, 1]], false, undefined, 1e-7, undefined);
    check_nearlyequal([1e10, 1e-7], [1.000090e10, 1e-8], [[1, 1]], true, 1e-4, 1e-7, undefined);
    check_nearlyequal([1e10, NaN], [NaN, NaN], [[0, 0]], false, undefined, undefined, undefined);
    check_nearlyequal([1e10, NaN], [NaN, NaN], [[0, 1]], false, undefined, undefined, true);

  });

  it('binary_operation', function () {
    var mata = $M.jsa2mat([1, 2, 3]);
    var matb = $M.jsa2mat([2, 8, 15]);
    expect($M.mat2jsa($M.plus(mata, matb))).toEqual([[3, 10, 18]]);
    expect($M.mat2jsa($M.minus(mata, matb))).toEqual([[-1, -6, -12]]);
    expect($M.mat2jsa($M.times(mata, matb))).toEqual([[2, 16, 45]]);
    expect($M.mat2jsa($M.rdivide(matb, mata))).toEqual([[2, 4, 5]]);
    expect($M.mat2jsa($M.ldivide(mata, matb))).toEqual([[2, 4, 5]]);
    expect($M.mat2jsa($M.power(matb, mata))).toEqual([[2, 64, 15 * 15 * 15]]);
  });

  it('unary_operation', function () {
    expect($M.mat2jsa($M.floor($M.jsa2mat([0.0, 0.1, 0.5, 0.9, 1.0, -0.1, -0.9, -1.0])))).toEqual([[0, 0, 0, 0, 1, -1, -1, -1]]);
    expect($M.mat2jsa($M.fix($M.jsa2mat([0.0, 0.1, 0.5, 0.9, 1.0, -0.1, -0.9, -1.0])))).toEqual([[0, 0, 0, 0, 1, 0, 0, -1]]);
    expect($M.mat2jsa($M.ceil($M.jsa2mat([0.0, 0.1, 0.5, 0.9, 1.0, -0.1, -0.9, -1.0])))).toEqual([[0, 1, 1, 1, 1, 0, 0, -1]]);
    expect($M.mat2jsa($M.uminus($M.jsa2mat([0.0, 2.5, -2.5, Infinity, -Infinity])))).toEqual([[0.0, -2.5, 2.5, -Infinity, Infinity]]);
    expect($M.mat2jsa($M.uplus($M.jsa2mat([0.0, 2.5, -2.5, Infinity, -Infinity])))).toEqual([[0.0, 2.5, -2.5, Infinity, -Infinity]]);
    expect($M.mat2jsa($M.floor(1.1))).toEqual([[1]]);
    expect($M.mat2jsa($M.ceil(1.1))).toEqual([[2]]);
    expect($M.mat2jsa($M.fix(1.1))).toEqual([[1]]);
    expect($M.mat2jsa($M.uminus(2))).toEqual([[-2]]);
    expect($M.mat2jsa($M.uplus(2))).toEqual([[2]]);
  });

  it('unary_operation_gpu', function () {
    expect($M.mat2jsa($M.floor($M.gpuArray([0.0, 0.1, 0.5, 0.9, 1.0, -0.1, -0.9, -1.0])))).toEqual([[0, 0, 0, 0, 1, -1, -1, -1]]);
    expect($M.mat2jsa($M.fix($M.gpuArray([0.0, 0.1, 0.5, 0.9, 1.0, -0.1, -0.9, -1.0])))).toEqual([[0, 0, 0, 0, 1, 0, 0, -1]]);
    expect($M.mat2jsa($M.ceil($M.gpuArray([0.0, 0.1, 0.5, 0.9, 1.0, -0.1, -0.9, -1.0])))).toEqual([[0, 1, 1, 1, 1, 0, 0, -1]]);
    expect($M.mat2jsa($M.uminus($M.gpuArray([0.0, 2.5, -2.5, Infinity, -Infinity])))).toEqual([[0.0, -2.5, 2.5, -Infinity, Infinity]]);
    expect($M.mat2jsa($M.uplus($M.gpuArray([0.0, 2.5, -2.5, Infinity, -Infinity])))).toEqual([[0.0, 2.5, -2.5, Infinity, -Infinity]]);
  });

  it('gpuArray', function () {
    var cpu = $M.jsa2mat([1, 3, 5]);
    var gpu = $M.gpuArray(cpu);
    var direct_gpu = $M.gpuArray([1, 3, 5]);
    expect($M.devicetype(direct_gpu)).toEqual('cl');
    var again_cpu = $M.gather(gpu);
    expect($M.devicetype(again_cpu)).toEqual('cpu');
    expect($M.mat2jsa(again_cpu)).toEqual([[1, 3, 5]]);
    expect($M.mat2jsa($M.gather(direct_gpu))).toEqual([[1, 3, 5]]);
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
    mat2.set($M.colon(), 5);//all
    expect($M.mat2jsa(mat2)).toEqual([[5, 5, 5], [5, 5, 5], [5, 5, 5]]);
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

  it('getdata', function () {
    var mat: $M.Matrix;
    var tary: (Float32Array | Int32Array | Uint8Array);
    for (var gpu = 0; gpu < 2; gpu++) {
      mat = $M.jsa2mat([10, 20, 30, 40, 50]);
      if (gpu == 1) {
        mat = $M.gpuArray(mat);
      }
      tary = mat.getdatacopy();
      expect(tary.length).toEqual(5);
      expect(tary[0]).toEqual(10);
      expect(tary[4]).toEqual(50);
      tary[1] = 55;
      expect(mat.get(2)).toEqual(20);//not modified
      tary = new Float32Array([51, 52, 53]);
      mat.getdatacopy(1, 2, tary);
      expect(tary[0]).toEqual(20);
      expect(tary[2]).toEqual(53);//not modified out of range

      tary = mat.getdataref();
      expect(tary.length).toEqual(5);
      expect(tary[0]).toEqual(10);
      expect(tary[4]).toEqual(50);

      tary = mat.getdataref(1, 2);
      expect(tary.length).toEqual(2);
      expect(tary[0]).toEqual(20);
      expect(tary[1]).toEqual(30);
    }
  });

  it('setdata', function () {
    var mat: $M.Matrix;
    var tary: (Float32Array | Int32Array | Uint8Array);
    for (var gpu = 0; gpu < 2; gpu++) {
      mat = $M.jsa2mat([10, 20, 30, 40, 50]);
      if (gpu == 1) {
        mat = $M.gpuArray(mat);
      }

      tary = new Float32Array([51, 52]);
      mat.setdata(tary, 1);
      expect($M.mat2jsa(mat)).toEqual([[10, 51, 52, 40, 50]]);
    }
  });

  it('binary_operation_gpu', function () {
    $M.autodestruct(function () {
      var cast_check = function (klass_a, klass_b, klass_out) {
        var mata = null;
        if (klass_a) {
          mata = $M.gpuArray($M.jsa2mat([1, 2, 3], false, klass_a));
        } else {
          mata = 1;
        }
        var matb = null;
        if (klass_b) {
          matb = $M.gpuArray($M.jsa2mat([1, 2, 3], false, klass_b));
        } else {
          matb = 2;
        }

        var matout = $M.plus(mata, matb);
        expect($M.klass(matout)).toEqual(klass_out);

        //matrix is scalar
        if (klass_a) {
          mata = $M.gpuArray($M.jsa2mat([1], false, klass_a));
        } else {
          mata = 1;
        }
        var matb = null;
        if (klass_b) {
          matb = $M.gpuArray($M.jsa2mat([2], false, klass_b));
        } else {
          matb = 2;
        }

        var matout = $M.plus(mata, matb);
        expect($M.klass(matout)).toEqual(klass_out);
      };
      cast_check('single', 'single', 'single');
      cast_check('single', null, 'single');
      cast_check(null, 'single', 'single');
      cast_check(null, null, 'single');
      cast_check('single', 'int32', 'single');
      cast_check('int32', 'uint8', 'int32');
      cast_check('uint8', 'logical', 'uint8');
      cast_check('logical', 'logical', 'single');
      cast_check('logical', null, 'single');
      cast_check('uint8', null, 'uint8');
      cast_check(null, 'int32', 'int32');
      cast_check('logical', 'int32', 'int32');

      var mata = $M.gpuArray($M.jsa2mat([1, 2, 3]));
      var matb = $M.jsa2mat([2, 8, 15]);
      expect($M.mat2jsa($M.plus(mata, matb))).toEqual([[3, 10, 18]]);
      expect($M.mat2jsa($M.minus(mata, matb))).toEqual([[-1, -6, -12]]);
      expect($M.mat2jsa($M.times(mata, matb))).toEqual([[2, 16, 45]]);
      expect($M.mat2jsa($M.rdivide(matb, mata))).toEqual([[2, 4, 5]]);
      expect($M.mat2jsa($M.ldivide(mata, matb))).toEqual([[2, 4, 5]]);
      var pow_jsa = $M.mat2jsa($M.power(matb, mata));
      //on gpu, [ [ 2.000000238418579, 64.00000762939453, 3375 ] ]
      expect(pow_jsa[0][0]).toBeCloseTo(2, 4);
      expect(pow_jsa[0][1]).toBeCloseTo(64, 4);
      expect(pow_jsa[0][2]).toBeCloseTo(15 * 15 * 15, 4);
      expect($M.mat2jsa($M.plus(mata, 1))).toEqual([[2, 3, 4]]);
      expect($M.mat2jsa($M.plus(2, mata))).toEqual([[3, 4, 5]]);
      var matscalar = $M.gpuArray($M.jsa2mat([5]));
      expect($M.mat2jsa($M.plus(mata, matscalar))).toEqual([[6, 7, 8]]);
      expect($M.mat2jsa($M.plus(mata, mata))).toEqual([[2, 4, 6]]);

      return [];
    });
  });

  it('reshape', function () {
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

  it('transpose', function () {
    var mat = $M.jsa2mat([[1, 2, 3], [4, 5, 6]]);
    var t = $M.transpose(mat);
    expect($M.mat2jsa(t)).toEqual([[1, 4], [2, 5], [3, 6]]);
    if (cl_enabled) {
      var matg = $M.gpuArray(mat);
      var tg = $M.transpose(matg);
      expect(tg instanceof MatrixCL).toBeTruthy();
      expect($M.mat2jsa(tg)).toEqual([[1, 4], [2, 5], [3, 6]]);
    }
  });

  it('squeeze', function () {
    var mat = $M.zeros(1, 2, 3);
    mat.squeeze_inplace();
    expect($M.sizejsa(mat)).toEqual([2, 3]);
    mat = $M.zeros(1, 2, 3, 4, 1, 5, 6);
    mat.squeeze_inplace();
    expect($M.sizejsa(mat)).toEqual([2, 3, 4, 5, 6]);
    mat = $M.zeros(1, 1, 5);
    mat.squeeze_inplace();
    expect($M.sizejsa(mat)).toEqual([5, 1]);
    mat = $M.zeros(1, 1, 0);
    mat.squeeze_inplace();
    expect($M.sizejsa(mat)).toEqual([0, 1]);
    mat = $M.zeros(1, 5);
    mat.squeeze_inplace();
    expect($M.sizejsa(mat)).toEqual([1, 5]);
    mat = $M.zeros(5, 1);
    mat.squeeze_inplace();
    expect($M.sizejsa(mat)).toEqual([5, 1]);
    mat = $M.zeros(1, 1);
    mat.squeeze_inplace();
    expect($M.sizejsa(mat)).toEqual([1, 1]);

    mat = $M.zeros(1, 2, 3, 4, 1, 5, 6);
    mat.set(1, 1, 2, 3, 1, 4, 2, 10);
    mat.set(1, 2, 1, 2, 1, 5, 4, 20);
    var mat2 = $M.squeeze(mat);
    expect($M.sizejsa(mat2)).toEqual([2, 3, 4, 5, 6]);
    expect(mat2.get(1, 2, 3, 4, 2)).toEqual(10);
    expect(mat2.get(2, 1, 2, 5, 4)).toEqual(20);
  });

  it('colonvec', function () {
    var vec = $M.colonvec(1, 5);
    expect($M.mat2jsa(vec)).toEqual([[1, 2, 3, 4, 5]]);
    expect($M.klass(vec)).toEqual('single');
    vec = $M.colonvec(1, 2, 5);
    expect($M.mat2jsa(vec)).toEqual([[1, 3, 5]]);
    vec = $M.colonvec(1, -1, 5);
    expect($M.sizejsa(vec)).toEqual([1, 0]);
    vec = $M.colonvec(1, -1);
    expect($M.sizejsa(vec)).toEqual([1, 0]);

    vec = $M.colonvec(-0.25, 0.25, 1.5);
    expect($M.mat2jsa(vec)).toEqual([[-0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5]]);
    vec = $M.colonvec(5.0, -1.25, 3.0);
    expect($M.mat2jsa(vec)).toEqual([[5.0, 3.75]]);

    vec = $M.colonvec(1e9, 1, 1e9 + 3, 'int32');//fails if klass is single because value > 8M loses precision
    expect($M.mat2jsa(vec)).toEqual([[1e9, 1e9 + 1, 1e9 + 2, 1e9 + 3]]);
  });

  it('repmat', function () {
    var mat = $M.gpuArray($M.colonvec(1, 6));
    mat.reshape_inplace(2, 3);

    var mat2 = $M.repmat(mat, 2);//equivalent to repmat(mat, 2, 2)
    expect($M.sizejsa(mat2)).toEqual([4, 6]);
    expect($M.isequal(mat2.get($M.colon(1, 2), $M.colon(1, 3)), mat)).toBeTruthy();
    expect($M.isequal(mat2.get($M.colon(3, 4), $M.colon(1, 3)), mat)).toBeTruthy();
    expect($M.isequal(mat2.get($M.colon(1, 2), $M.colon(4, 6)), mat)).toBeTruthy();
    expect($M.isequal(mat2.get($M.colon(3, 4), $M.colon(4, 6)), mat)).toBeTruthy();

    var mat2 = $M.repmat(mat, 2, 3, 4, 1);
    expect($M.sizejsa(mat2)).toEqual([4, 9, 4]);
    expect($M.isequal(mat2.get($M.colon(3, 4), $M.colon(4, 6), 3), mat)).toBeTruthy();
    var mat2 = $M.repmat(mat, 2, 3, 4, 0);
    expect($M.sizejsa(mat2)).toEqual([4, 9, 4, 0]);
    var mat2 = $M.repmat(mat, [2, 3, 4, 5]);
    expect($M.sizejsa(mat2)).toEqual([4, 9, 4, 5]);
    var mat2 = $M.repmat(mat, $M.jsa2mat([2, 3, 4, 5]));
    expect($M.sizejsa(mat2)).toEqual([4, 9, 4, 5]);


  });

  it('max_min_axis', function () {
    var mat = $M.jsa2mat([3, 5, 1], false);//row vector
    var mat2 = $M.max(mat);//1x1 matrix
    expect($M.sizejsa(mat2)).toEqual([1, 1]);
    expect(mat2.get()).toEqual(5);

    mat = $M.jsa2mat([2, 4, 6], true);//column vector
    mat2 = $M.max(mat);//1x1 matrix
    expect($M.sizejsa(mat2)).toEqual([1, 1]);
    expect(mat2.get()).toEqual(6);

    mat2 = $M.max(5);
    expect($M.sizejsa(mat2)).toEqual([1, 1]);
    expect(mat2.get()).toEqual(5);

    mat = $M.zeros(3, 4, 5);
    mat.set(1, 1, 2, 10);
    mat.set(2, 3, 1, 20);
    mat2 = $M.max(mat);//along row
    expect($M.sizejsa(mat2)).toEqual([1, 4, 5]);
    expect(mat2.get(1, 1, 2)).toEqual(10);
    expect(mat2.get(1, 3, 1)).toEqual(20);

    mat2 = $M.max(mat, null, 2);
    expect($M.sizejsa(mat2)).toEqual([3, 1, 5]);
    expect(mat2.get(1, 1, 2)).toEqual(10);
    expect(mat2.get(2, 1, 1)).toEqual(20);
    mat2 = $M.max(mat, null, 3);
    expect($M.sizejsa(mat2)).toEqual([3, 4]);
    expect(mat2.get(1, 1)).toEqual(10);
    expect(mat2.get(2, 3)).toEqual(20);
    mat2 = $M.max(mat, null, 4);
    expect($M.sizejsa(mat2)).toEqual([3, 4, 5]);
    expect(mat2.get(1, 1, 2)).toEqual(10);
    expect(mat2.get(2, 3, 1)).toEqual(20);

    mat = $M.zeros(2, 1, 1, 3);
    mat.set(2, 1, 1, 2, 10);
    mat.set(1, 1, 1, 3, 20);
    mat2 = $M.max(mat, null, 4);
    expect($M.sizejsa(mat2)).toEqual([2, 1]);
    expect(mat2.get(2, 1, 1)).toEqual(10);
    expect(mat2.get(1, 1, 1)).toEqual(20);

    mat = $M.zeros(0, 0);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([0, 0]);
    mat = $M.zeros(0, 1);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([0, 1]);
    mat = $M.zeros(1, 0);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 0]);
    mat = $M.zeros(2, 0);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 0]);
    mat = $M.zeros(0, 2);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([0, 2]);
    mat = $M.zeros(2, 2, 0);
    mat2 = $M.max(mat, null, 1);
    expect($M.sizejsa(mat2)).toEqual([1, 2, 0]);
    mat = $M.zeros(2, 2, 0);
    mat2 = $M.max(mat, null, 2);
    expect($M.sizejsa(mat2)).toEqual([2, 1, 0]);
    mat = $M.zeros(2, 2, 0);
    mat2 = $M.max(mat, null, 3);
    expect($M.sizejsa(mat2)).toEqual([2, 2, 0]);

    mat = $M.zeros(3, 4, 5);
    mat.set(1, 1, 2, 10);
    mat.set(2, 3, 1, 20);
    mat.set(3, 1, 2, -2);
    mat.set(1, 3, 1, -5);
    mat2 = $M.min(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 4, 5]);
    expect(mat2.get(1, 1, 2)).toEqual(-2);
    expect(mat2.get(1, 3, 1)).toEqual(-5);
  });

  it('max_min_element', function () {
    var mata = $M.jsa2mat([[1, 2], [3, 4]]);
    var matb = $M.jsa2mat([[5, 2], [6, 1]]);
    var matc = $M.max(mata, matb);
    expect($M.mat2jsa(matc)).toEqual([[5, 2], [6, 4]]);
    matc = $M.max(mata, 3);
    expect($M.mat2jsa(matc)).toEqual([[3, 3], [3, 4]]);
    matc = $M.max(2, matb);
    expect($M.mat2jsa(matc)).toEqual([[5, 2], [6, 2]]);
    matc = $M.max(5, 6);
    expect($M.mat2jsa(matc)).toEqual([[6]]);
    matc = $M.min(mata, matb);
    expect($M.mat2jsa(matc)).toEqual([[1, 2], [3, 1]]);
  });

  it('argmax_min', function () {
    var mat = $M.jsa2mat([3, 5, 1], false);//row vector
    var {M, I} = $M.argmax(mat);
    expect($M.sizejsa(M)).toEqual([1, 1]);
    expect($M.sizejsa(I)).toEqual([1, 1]);
    expect(M.get()).toEqual(5);
    expect(I.get()).toEqual(2);

    mat = $M.zeros(3, 4, 5);
    mat.set(1, 1, 2, 10);
    mat.set(3, 1, 2, 10);
    mat.set(2, 3, 1, 20);
    mat.set(3, 3, 1, 20);
    var {M, I} = $M.argmax(mat);//along row
    expect($M.sizejsa(M)).toEqual([1, 4, 5]);
    expect(M.get(1, 1, 2)).toEqual(10);
    expect(M.get(1, 3, 1)).toEqual(20);
    expect($M.sizejsa(I)).toEqual([1, 4, 5]);
    expect(I.get(1, 1, 2)).toEqual(1);//returns index of first occurence
    expect(I.get(1, 3, 1)).toEqual(2);

    var {M, I} = $M.argmax(mat, null, 4);//no change
    expect($M.sizejsa(M)).toEqual([3, 4, 5]);
    expect(M.get(1, 1, 2)).toEqual(10);
    expect(M.get(2, 3, 1)).toEqual(20);
    expect($M.sizejsa(I)).toEqual([3, 4, 5]);//all elements are 1
    expect(I.get(1, 1, 2)).toEqual(1);
    expect(I.get(2, 3, 1)).toEqual(1);

    mat = $M.zeros(3, 4, 5);
    mat.set(1, 1, 2, 10);
    mat.set(2, 3, 1, 20);
    mat.set(3, 1, 2, -2);
    mat.set(1, 3, 1, -5);
    var {M, I} = $M.argmin(mat);//along row
    expect($M.sizejsa(M)).toEqual([1, 4, 5]);
    expect(M.get(1, 1, 2)).toEqual(-2);
    expect(M.get(1, 3, 1)).toEqual(-5);
    expect($M.sizejsa(I)).toEqual([1, 4, 5]);
    expect(I.get(1, 1, 2)).toEqual(3);
    expect(I.get(1, 3, 1)).toEqual(1);
  });

  it('max_min_element_gpu', function () {
    var mata = $M.gpuArray($M.jsa2mat([[1, 2], [3, 4]]));
    var matb = $M.gpuArray($M.jsa2mat([[5, 2], [6, 1]]));
    var matc = $M.max(mata, matb);
    expect($M.mat2jsa(matc)).toEqual([[5, 2], [6, 4]]);
    matc = $M.max(mata, 3);
    expect($M.mat2jsa(matc)).toEqual([[3, 3], [3, 4]]);
    matc = $M.max(2, matb);
    expect($M.mat2jsa(matc)).toEqual([[5, 2], [6, 2]]);
    matc = $M.max(5, 6);
    expect($M.mat2jsa(matc)).toEqual([[6]]);
    matc = $M.min(mata, matb);
    expect($M.mat2jsa(matc)).toEqual([[1, 2], [3, 1]]);
  });


  it('max_min_axis_gpu', function () {
    var mat = $M.gpuArray($M.jsa2mat([3, 5, 1], false));//row vector
    var mat2 = $M.max(mat);//1x1 matrix
    expect($M.sizejsa(mat2)).toEqual([1, 1]);
    expect(mat2.get()).toEqual(5);

    mat = $M.gpuArray($M.jsa2mat([2, 4, 6], true));//column vector
    mat2 = $M.max(mat);//1x1 matrix
    expect($M.sizejsa(mat2)).toEqual([1, 1]);
    expect(mat2.get()).toEqual(6);

    mat2 = $M.max(5);
    expect($M.sizejsa(mat2)).toEqual([1, 1]);
    expect(mat2.get()).toEqual(5);

    mat = $M.gpuArray($M.zeros(3, 4, 5));
    mat.set(1, 1, 2, 10);
    mat.set(2, 3, 1, 20);
    mat2 = $M.max(mat);//along row
    expect($M.sizejsa(mat2)).toEqual([1, 4, 5]);
    expect(mat2.get(1, 1, 2)).toEqual(10);
    expect(mat2.get(1, 3, 1)).toEqual(20);

    mat2 = $M.max(mat, null, 2);
    expect($M.sizejsa(mat2)).toEqual([3, 1, 5]);
    expect(mat2.get(1, 1, 2)).toEqual(10);
    expect(mat2.get(2, 1, 1)).toEqual(20);
    mat2 = $M.max(mat, null, 3);
    expect($M.sizejsa(mat2)).toEqual([3, 4]);
    expect(mat2.get(1, 1)).toEqual(10);
    expect(mat2.get(2, 3)).toEqual(20);
    mat2 = $M.max(mat, null, 4);
    expect($M.sizejsa(mat2)).toEqual([3, 4, 5]);
    expect(mat2.get(1, 1, 2)).toEqual(10);
    expect(mat2.get(2, 3, 1)).toEqual(20);

    mat = $M.gpuArray($M.zeros(2, 1, 1, 3));
    mat.set(2, 1, 1, 2, 10);
    mat.set(1, 1, 1, 3, 20);
    mat2 = $M.max(mat, null, 4);
    expect($M.sizejsa(mat2)).toEqual([2, 1]);
    expect(mat2.get(2, 1, 1)).toEqual(10);
    expect(mat2.get(1, 1, 1)).toEqual(20);

    mat = $M.gpuArray($M.zeros(0, 0));
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([0, 0]);
    mat = $M.zeros(0, 1);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([0, 1]);
    mat = $M.zeros(1, 0);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 0]);
    mat = $M.zeros(2, 0);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 0]);
    mat = $M.zeros(0, 2);
    mat2 = $M.max(mat);
    expect($M.sizejsa(mat2)).toEqual([0, 2]);
    mat = $M.zeros(2, 2, 0);
    mat2 = $M.max(mat, null, 1);
    expect($M.sizejsa(mat2)).toEqual([1, 2, 0]);
    mat = $M.zeros(2, 2, 0);
    mat2 = $M.max(mat, null, 2);
    expect($M.sizejsa(mat2)).toEqual([2, 1, 0]);
    mat = $M.zeros(2, 2, 0);
    mat2 = $M.max(mat, null, 3);
    expect($M.sizejsa(mat2)).toEqual([2, 2, 0]);

    mat = $M.gpuArray($M.zeros(3, 4, 5));
    mat.set(1, 1, 2, 10);
    mat.set(2, 3, 1, 20);
    mat.set(3, 1, 2, -2);
    mat.set(1, 3, 1, -5);
    mat2 = $M.min(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 4, 5]);
    expect(mat2.get(1, 1, 2)).toEqual(-2);
    expect(mat2.get(1, 3, 1)).toEqual(-5);
  });

  it('argmax_min_gpu', function () {
    var mat = $M.gpuArray($M.jsa2mat([3, 5, 1], false));//row vector
    var {M, I} = $M.argmax(mat);
    expect($M.sizejsa(M)).toEqual([1, 1]);
    expect($M.sizejsa(I)).toEqual([1, 1]);
    expect(M.get()).toEqual(5);
    expect(I.get()).toEqual(2);

    mat = $M.gpuArray($M.zeros(3, 4, 5));
    mat.set(1, 1, 2, 10);
    mat.set(3, 1, 2, 10);
    mat.set(2, 3, 1, 20);
    mat.set(3, 3, 1, 20);
    var {M, I} = $M.argmax(mat);//along row
    expect($M.sizejsa(M)).toEqual([1, 4, 5]);
    expect(M.get(1, 1, 2)).toEqual(10);
    expect(M.get(1, 3, 1)).toEqual(20);
    expect($M.sizejsa(I)).toEqual([1, 4, 5]);
    expect(I.get(1, 1, 2)).toEqual(1);//returns index of first occurence
    expect(I.get(1, 3, 1)).toEqual(2);

    var {M, I} = $M.argmax(mat, null, 4);//no change
    expect($M.sizejsa(M)).toEqual([3, 4, 5]);
    expect(M.get(1, 1, 2)).toEqual(10);
    expect(M.get(2, 3, 1)).toEqual(20);
    expect($M.sizejsa(I)).toEqual([3, 4, 5]);//all elements are 1
    expect(I.get(1, 1, 2)).toEqual(1);
    expect(I.get(2, 3, 1)).toEqual(1);

    mat = $M.gpuArray($M.zeros(3, 4, 5));
    mat.set(1, 1, 2, 10);
    mat.set(2, 3, 1, 20);
    mat.set(3, 1, 2, -2);
    mat.set(1, 3, 1, -5);
    var {M, I} = $M.argmin(mat);//along row
    expect($M.sizejsa(M)).toEqual([1, 4, 5]);
    expect(M.get(1, 1, 2)).toEqual(-2);
    expect(M.get(1, 3, 1)).toEqual(-5);
    expect($M.sizejsa(I)).toEqual([1, 4, 5]);
    expect(I.get(1, 1, 2)).toEqual(3);
    expect(I.get(1, 3, 1)).toEqual(1);
  });

  it('exp_log', function () {
    var mat = $M.jsa2mat([0.0, 1.0, 10.0]);
    var mat2 = $M.exp(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 3]);
    expect(mat2.get(1)).toBeCloseTo(1.0, 2);
    expect(mat2.get(2)).toBeCloseTo(2.718, 2);
    expect(mat2.get(3)).toBeCloseTo(22026.47, 1);
    var mat3 = $M.log(mat2);
    expect($M.sizejsa(mat3)).toEqual([1, 3]);
    expect(mat3.get(1)).toBeCloseTo(0.0, 2);
    expect(mat3.get(2)).toBeCloseTo(1.0, 2);
    expect(mat3.get(3)).toBeCloseTo(10.0, 1);
  });

  it('exp_log_gpu', function () {
    if (MatrixCL) {
      var mat = $M.gpuArray($M.jsa2mat([0.0, 1.0, 10.0]));
      var mat2 = $M.exp(mat);
      expect($M.sizejsa(mat2)).toEqual([1, 3]);
      expect(mat2.get(1)).toBeCloseTo(1.0, 2);
      expect(mat2.get(2)).toBeCloseTo(2.718, 2);
      expect(mat2.get(3)).toBeCloseTo(22026.47, 1);
      expect(mat2 instanceof MatrixCL).toBeTruthy();
      var mat3 = $M.log(mat2);
      expect($M.sizejsa(mat3)).toEqual([1, 3]);
      expect(mat3.get(1)).toBeCloseTo(0.0, 2);
      expect(mat3.get(2)).toBeCloseTo(1.0, 2);
      expect(mat3.get(3)).toBeCloseTo(10.0, 1);
      expect(mat3 instanceof MatrixCL).toBeTruthy();
    }
  });

  it('rand', function () {
    var mat = $M.rand(2, 3);
    expect($M.sizejsa(mat)).toEqual([2, 3]);
    for (var i = 1; i <= $M.numel(mat); i++) {
      var val = mat.get(i);
      expect(val >= 0.0).toBeTruthy();
      expect(val < 1.0).toBeTruthy();
    }

    mat = $M.randn(20, 50);
    expect($M.sizejsa(mat)).toEqual([20, 50]);
    var sum = 0.0;
    var sqsum = 0.0;
    for (var i = 1; i <= $M.numel(mat); i++) {
      var val = mat.get(i);
      sum += val;
      sqsum += val * val;
    }
    var mean = sum / (20 * 50);
    var variance = sqsum / (20 * 50) - mean * mean;

    expect(mean > -0.1).toBeTruthy();
    expect(mean < 0.1).toBeTruthy();
    expect(variance > 0.9).toBeTruthy();
    expect(variance < 1.1).toBeTruthy();

    mat = $M.randi(3, 4, 5);
    expect($M.sizejsa(mat)).toEqual([4, 5]);
    for (var i = 1; i <= $M.numel(mat); i++) {
      var val = mat.get(i);
      expect(val >= 1).toBeTruthy();
      expect(val <= 3).toBeTruthy();
    }

    mat = $M.randi([10, 20], 4, 5);
    expect($M.sizejsa(mat)).toEqual([4, 5]);
    for (var i = 1; i <= $M.numel(mat); i++) {
      var val = mat.get(i);
      expect(val >= 10).toBeTruthy();
      expect(val <= 20).toBeTruthy();
    }
  });

  it('sum', function () {
    var mat = $M.jsa2mat([[1, 2, 3], [40, 50, 60]]);
    var mat2 = $M.sum(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 3]);
    expect($M.mat2jsa(mat2)).toEqual([[41, 52, 63]]);
    mat2 = $M.sum(mat, 1);
    expect($M.sizejsa(mat2)).toEqual([1, 3]);
    expect($M.mat2jsa(mat2)).toEqual([[41, 52, 63]]);
    mat2 = $M.sum(mat, 2);
    expect($M.sizejsa(mat2)).toEqual([2, 1]);
    expect($M.mat2jsa(mat2)).toEqual([[6], [150]]);
    mat = $M.jsa2mat([[1, 2, 3]]);
    mat2 = $M.sum(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 1]);
    expect($M.mat2jsa(mat2)).toEqual([[6]]);
    mat2 = $M.sum(mat, 1);
    expect($M.sizejsa(mat2)).toEqual([1, 3]);
    expect($M.mat2jsa(mat2)).toEqual([[1, 2, 3]]);

  });

  it('sum_gpu', function () {
    var mat = $M.gpuArray($M.jsa2mat([[1, 2, 3], [40, 50, 60]]));
    var mat2 = $M.sum(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 3]);
    expect($M.mat2jsa(mat2)).toEqual([[41, 52, 63]]);
    mat2 = $M.sum(mat, 1);
    expect($M.sizejsa(mat2)).toEqual([1, 3]);
    expect($M.mat2jsa(mat2)).toEqual([[41, 52, 63]]);
    mat2 = $M.sum(mat, 2);
    expect($M.sizejsa(mat2)).toEqual([2, 1]);
    expect($M.mat2jsa(mat2)).toEqual([[6], [150]]);
    mat = $M.gpuArray($M.jsa2mat([[1, 2, 3]]));
    mat2 = $M.sum(mat);
    expect($M.sizejsa(mat2)).toEqual([1, 1]);
    expect($M.mat2jsa(mat2)).toEqual([[6]]);
    mat2 = $M.sum(mat, 1);
    expect($M.sizejsa(mat2)).toEqual([1, 3]);
    expect($M.mat2jsa(mat2)).toEqual([[1, 2, 3]]);

  });

  it('mtimes', function () {
    var mata = $M.jsa2mat([[1, 2], [3, 4], [5, 6]]);
    var matb = $M.jsa2mat([[8, 7, 6], [5, 4, 3]]);
    var matc = $M.mtimes(mata, matb);
    expect($M.sizejsa(matc)).toEqual([3, 3]);
    expect($M.mat2jsa(matc)).toEqual([[18, 15, 12], [44, 37, 30], [70, 59, 48]]);

    matb = $M.jsa2mat([[10], [20]]);
    matc = $M.mtimes(mata, matb);
    expect($M.sizejsa(matc)).toEqual([3, 1]);
    expect($M.mat2jsa(matc)).toEqual([[50], [110], [170]]);

    expect(() => $M.mtimes(matb, mata)).toThrow();
    expect(() => $M.mtimes($M.zeros(3, 3, 3), mata)).toThrow();
    expect(() => $M.mtimes(mata, $M.zeros(3, 3, 3))).toThrow();
    expect(() => $M.mtimes($M.zeros(3, 3, 'int32'), mata)).toThrow();

  });

  it('mtimes_gpu', function () {
    var mata = $M.gpuArray([[1, 2], [3, 4], [5, 6]]);
    var matb = $M.gpuArray([[8, 7, 6], [5, 4, 3]]);
    var matc = $M.mtimes(mata, matb);
    expect($M.sizejsa(matc)).toEqual([3, 3]);
    expect($M.mat2jsa(matc)).toEqual([[18, 15, 12], [44, 37, 30], [70, 59, 48]]);

    matb = $M.gpuArray([[10], [20]]);
    matc = $M.mtimes(mata, matb);
    expect($M.sizejsa(matc)).toEqual([3, 1]);
    expect($M.mat2jsa(matc)).toEqual([[50], [110], [170]]);

    expect(() => $M.mtimes(matb, mata)).toThrow();
    expect(() => $M.mtimes($M.zeros(3, 3, 3), mata)).toThrow();
    expect(() => $M.mtimes(mata, $M.zeros(3, 3, 3))).toThrow();
    expect(() => $M.mtimes($M.zeros(3, 3, 'int32'), mata)).toThrow();

  });

  it('cat', function () {
    var mat1 = $M.jsa2mat([[1, 2], [3, 4]]);
    var mat2 = $M.jsa2mat([[5, 6], [7, 8]]);

    var matv = $M.vertcat(mat1, mat2);
    expect($M.mat2jsa(matv)).toEqual(([[1, 2], [3, 4], [5, 6], [7, 8]]));
    var math = $M.horzcat(mat1, mat2);
    expect($M.mat2jsa(math)).toEqual(([[1, 2, 5, 6], [3, 4, 7, 8]]));
    var mat3 = $M.cat(3, mat1, mat2);
    expect($M.mat2jsa(mat3)).toEqual(([[[1, 5], [2, 6]], [[3, 7], [4, 8]]]));
  });

  it('permute', function () {
    var mat1 = $M.reshape($M.colonvec(1, 2 * 3 * 5), 2, 3, 5);
    var mat2 = $M.permute(mat1, [2, 1, 3]);
    var pairs = [
      [[1, 2, 3], [2, 1, 3]],
      [[2, 3, 5], [3, 2, 5]]];
    expect($M.sizejsa(mat2)).toEqual([3, 2, 5]);
    pairs.forEach(([left, right]) => {
      expect(mat1.get(...left)).toEqual(mat2.get(...right));
    });
    var mat3 = $M.ipermute(mat2, [2, 1, 3]);
    expect($M.isequal(mat1, mat3)).toBeTruthy();

    mat2 = $M.permute(mat1, [3, 1, 2]);
    pairs = [
      [[1, 2, 3], [3, 1, 2]],
      [[2, 3, 5], [5, 2, 3]]];
    expect($M.sizejsa(mat2)).toEqual([5, 2, 3]);
    pairs.forEach(([left, right]) => {
      expect(mat1.get(...left)).toEqual(mat2.get(...right));
    });
    mat3 = $M.ipermute(mat2, [3, 1, 2]);
    expect($M.isequal(mat1, mat3)).toBeTruthy();

    mat2 = $M.permute(mat1, [3, 1, 5, 2, 4]);
    pairs = [
      [[1, 2, 3], [3, 1, 1, 2]],
      [[2, 3, 5], [5, 2, 1, 3]]];
    expect($M.sizejsa(mat2)).toEqual([5, 2, 1, 3]);
    pairs.forEach(([left, right]) => {
      expect(mat1.get(...left)).toEqual(mat2.get(...right));
    });
    mat3 = $M.ipermute(mat2, [3, 1, 5, 2, 4]);
    expect($M.isequal(mat1, mat3)).toBeTruthy();
  });
});

describe('npy io', function () {
  it('reads_npy', function () {
    var mat = $M.npyread(fs.readFileSync('spec/fixture/npy/int32_3x1.npy'));
    expect($M.sizejsa(mat)).toEqual([3, 1]);
    expect($M.mat2jsa(mat)).toEqual([[10], [20], [30]]);
    expect($M.klass(mat)).toEqual('int32');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/int32_3x1.npy')));
    expect($M.sizejsa(mat)).toEqual([3, 1]);
    expect($M.mat2jsa(mat)).toEqual([[10], [20], [30]]);
    expect($M.klass(mat)).toEqual('int32');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/int32_3x1_bigendian.npy')));
    expect($M.sizejsa(mat)).toEqual([3, 1]);
    expect($M.mat2jsa(mat)).toEqual([[10], [20], [30]]);
    expect($M.klass(mat)).toEqual('int32');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/int32_3x1_1d.npy')));
    expect($M.sizejsa(mat)).toEqual([3, 1]);//1d array to 2d column vector
    expect($M.mat2jsa(mat)).toEqual([[10], [20], [30]]);
    expect($M.klass(mat)).toEqual('int32');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/int32_2x3_forder.npy')));
    expect($M.sizejsa(mat)).toEqual([2, 3]);
    expect($M.mat2jsa(mat)).toEqual([[10, 20, 30], [40, 50, 60]]);
    expect($M.klass(mat)).toEqual('int32');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/int32_2x3_corder.npy')));
    expect($M.sizejsa(mat)).toEqual([2, 3]);
    expect($M.mat2jsa(mat)).toEqual([[10, 20, 30], [40, 50, 60]]);
    expect($M.klass(mat)).toEqual('int32');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/int32_2x3x4_forder.npy')));
    expect($M.sizejsa(mat)).toEqual([2, 3, 4]);
    expect($M.mat2jsa(mat.get(1, $M.colon(), $M.colon()))).toEqual([[[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]]]);
    expect($M.mat2jsa(mat.get(2, $M.colon(), $M.colon()))).toEqual([[[12, 13, 14, 15], [16, 17, 18, 19], [20, 21, 22, 23]]]);
    expect($M.klass(mat)).toEqual('int32');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/int32_2x3x4_corder.npy')));
    expect($M.sizejsa(mat)).toEqual([2, 3, 4]);
    expect($M.mat2jsa(mat.get(1, $M.colon(), $M.colon()))).toEqual([[[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]]]);
    expect($M.mat2jsa(mat.get(2, $M.colon(), $M.colon()))).toEqual([[[12, 13, 14, 15], [16, 17, 18, 19], [20, 21, 22, 23]]]);
    expect($M.klass(mat)).toEqual('int32');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/float32_1x2.npy')));
    expect($M.sizejsa(mat)).toEqual([1, 2]);
    expect($M.mat2jsa(mat)).toEqual([[1.0, 1.5]]);
    expect($M.klass(mat)).toEqual('single');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/float64_1x2.npy')));
    expect($M.sizejsa(mat)).toEqual([1, 2]);
    expect($M.mat2jsa(mat)).toEqual([[1.0, 1.5]]);
    expect($M.klass(mat)).toEqual('single');//no double type

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/uint8_1x2.npy')));
    expect($M.sizejsa(mat)).toEqual([1, 2]);
    expect($M.mat2jsa(mat)).toEqual([[1, 2]]);
    expect($M.klass(mat)).toEqual('uint8');

    mat = $M.npyread(new Uint8Array(fs.readFileSync('spec/fixture/npy/bool_1x2.npy')));
    expect($M.sizejsa(mat)).toEqual([1, 2]);
    expect($M.mat2jsa(mat)).toEqual([[1, 0]]);
    expect($M.klass(mat)).toEqual('logical');
  });


  it('writes_npy', function () {
    var mat = $M.jsa2mat([[10, 20, 30], [40, 50, 60]]);
    var ab = $M.npysave(mat);
    var out_path_1 = os.tmpdir() + '/numpy_save_1.npy';
    var mat2 = $M.jsa2mat([[10, 20, 30], [40, 50, 60]], false, 'int32');
    mat2.reshape_inplace(1, 1, 1, 1, 1, 1, 1, 1, 2, 3);
    var out_path_2 = os.tmpdir() + '/numpy_save_2.npy';
    var ab2 = $M.npysave(mat2);
    fs.writeFileSync(out_path_1, new Buffer(ab));
    fs.writeFileSync(out_path_2, new Buffer(ab2));
    expect(() => {
      child_process.execSync('python spec/check_numpy_save.py ' + out_path_1 + ' ' + out_path_2);
    }).not.toThrow();
    fs.unlinkSync(out_path_1);
    fs.unlinkSync(out_path_2);
  });
});
