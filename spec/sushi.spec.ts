/// <reference path="../node_modules/definitely-typed-jasmine/jasmine.d.ts" />
import $M = require('../src/sushi');

declare var require;
if (false) {
var f: typeof $M = require('../src/augment');
}

describe('Sushi class', function(){
    it('exist Sushi class',function(){
        expect($M).toBeDefined();
    });
    
    it('zeros',function() {
        var mat = $M.zeros();
        expect(mat._size).toEqual([1,1]);//1x1 matrix of 0
        expect(mat._klass).toEqual('single');//default type is single (Float32Array)
        expect(mat._data).toEqual(jasmine.any(Float32Array));
        expect(mat._data[0]).toEqual(0);
        
        mat = $M.zeros(3);//3x3 matrix
        expect(mat._size).toEqual([3,3]);
        
        mat = $M.zeros(2,3);//2x3 matrix
        expect(mat._size).toEqual([2,3]);
        expect(mat._data.length).toEqual(2*3);
        expect(mat._numel).toEqual(6);
        expect(mat._strides).toEqual([1,2]);
        for (var i = 0; i < mat._data.length; i++) {
            expect(mat._data[i]).toEqual(0);
        }
        
        mat = $M.zeros(3,4,5);//3x4x5 matrix
        expect(mat._size).toEqual([3,4,5]);
        expect(mat._data.length).toEqual(3*4*5);
        expect(mat._numel).toEqual(3*4*5);
        expect(mat._strides).toEqual([1,3,12]);
        for (var i = 0; i < mat._data.length; i++) {
            expect(mat._data[i]).toEqual(0);
        }
        
        mat = $M.zeros(3,4,5,6);
        expect(mat._size).toEqual([3,4,5,6]);
        
        //zero-dimension case
        mat = $M.zeros(0);
        expect(mat._size).toEqual([0,0]);
        expect(mat._numel).toEqual(0);
        
        mat = $M.zeros(0,0);
        expect(mat._size).toEqual([0,0]);
        expect(mat._numel).toEqual(0);
        mat = $M.zeros(0,2);
        expect(mat._size).toEqual([0,2]);
        expect(mat._numel).toEqual(0);
        mat = $M.zeros(2,0);
        expect(mat._size).toEqual([2,0]);
        expect(mat._numel).toEqual(0);
        mat = $M.zeros(2,2,0);
        expect(mat._size).toEqual([2,2,0]);
        expect(mat._numel).toEqual(0);
        mat = $M.zeros(2,2,0,3);
        expect(mat._size).toEqual([2,2,0,3]);
        expect(mat._numel).toEqual(0);
        
        //tailing 1
        mat = $M.zeros(1);
        expect(mat._size).toEqual([1,1]);
        expect(mat._numel).toEqual(1);
        
        mat = $M.zeros(1,1);
        expect(mat._size).toEqual([1,1]);
        expect(mat._numel).toEqual(1);
        
        mat = $M.zeros(1,1,1);
        expect(mat._size).toEqual([1,1]);//at least 2 dims
        expect(mat._numel).toEqual(1);
        
        mat = $M.zeros(2,3,2,1);
        expect(mat._size).toEqual([2,3,2]);
        expect(mat._numel).toEqual(2*3*2);
        mat = $M.zeros(2,3,2,1,1);
        expect(mat._size).toEqual([2,3,2]);
        expect(mat._numel).toEqual(2*3*2);
        mat = $M.zeros(2,3,2,1,2);
        expect(mat._size).toEqual([2,3,2,1,2]);
        expect(mat._numel).toEqual(2*3*2*2);
        mat = $M.zeros(2,3,2,1,0);
        expect(mat._size).toEqual([2,3,2,1,0]);
        expect(mat._numel).toEqual(0);
        
        //TODO: from size matrix
        
        //type specification
        mat = $M.zeros(2,3,'single');
        expect(mat._size).toEqual([2,3]);
        expect(mat._klass).toEqual('single');
        expect(mat._data).toEqual(jasmine.any(Float32Array));
        expect(mat._data[0]).toEqual(0);
        mat = $M.zeros(2,3,'uint8');
        expect(mat._size).toEqual([2,3]);
        expect(mat._klass).toEqual('uint8');
        expect(mat._data).toEqual(jasmine.any(Uint8Array));
        expect(mat._data[0]).toEqual(0);
        mat = $M.zeros(2,3,'int32');
        expect(mat._size).toEqual([2,3]);
        expect(mat._klass).toEqual('int32');
        expect(mat._data).toEqual(jasmine.any(Int32Array));
        expect(mat._data[0]).toEqual(0);
        mat = $M.zeros(2,3,'logical');
        expect(mat._size).toEqual([2,3]);
        expect(mat._klass).toEqual('logical');
        expect(mat._data).toEqual(jasmine.any(Uint8Array));
        expect(mat._data[0]).toEqual(0);
        
        mat = $M.zeros(2,3,'int32');
        mat._data[0] = 10;//change data
        mat = $M.zeros(3,4,'like',mat);
        expect(mat._size).toEqual([3,4]);//only type is copied, not size
        expect(mat._klass).toEqual('int32');
        expect(mat._data).toEqual(jasmine.any(Int32Array));
        expect(mat._data[0]).toEqual(0);//only type is copied, not data
        
        //invalid argument
        expect(() => {$M.zeros(-1);}).toThrow();//negative
        expect(() => {$M.zeros(1.1);}).toThrow();//not integer
        expect(() => {$M.zeros(2,-1);}).toThrow();
        expect(() => {$M.zeros(2,3,-1);}).toThrow();
        expect(() => {$M.zeros(2,3,1.1);}).toThrow();
        expect(() => {$M.zeros(2,0,1.1);}).toThrow();
        expect(() => {$M.zeros(2,3,'foo');}).toThrow();//unknown klass
        expect(() => {$M.zeros(2,3,'like',null);}).toThrow();
    });
    
    it('ones',function(){
        //same as zeros except that content is filled with 1
        var mat = $M.ones();
        expect(mat._size).toEqual([1,1]);//1x1 matrix of 0
        expect(mat._klass).toEqual('single');//default type is single (Float32Array)
        expect(mat._data).toEqual(jasmine.any(Float32Array));
        expect(mat._data[0]).toEqual(1);
        
        mat = $M.ones(3);//3x3 matrix
        expect(mat._size).toEqual([3,3]);
        
        mat = $M.ones(2,3);//2x3 matrix
        expect(mat._size).toEqual([2,3]);
        expect(mat._data.length).toEqual(2*3);
        expect(mat._numel).toEqual(6);
        expect(mat._strides).toEqual([1,2]);
        for (var i = 0; i < mat._data.length; i++) {
            expect(mat._data[i]).toEqual(1);
        }
        
        mat = $M.ones(3,4,5);//3x4x5 matrix
        expect(mat._size).toEqual([3,4,5]);
        
        mat = $M.ones(2,3,'uint8');
        expect(mat._size).toEqual([2,3]);
        expect(mat._klass).toEqual('uint8');
        expect(mat._data).toEqual(jasmine.any(Uint8Array));
        expect(mat._data[0]).toEqual(1);
        
        mat = $M.ones(2,3,'int32');
        mat._data[0] = 10;//change data
        mat = $M.ones(3,4,'like',mat);
        expect(mat._size).toEqual([3,4]);//only type is copied, not size
        expect(mat._klass).toEqual('int32');
        expect(mat._data).toEqual(jasmine.any(Int32Array));
        expect(mat._data[0]).toEqual(1);//only type is copied, not data
    });
});
