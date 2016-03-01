"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Matrix = require('../matrix');
var $CL = require('./driver');
var MatrixCL = (function (_super) {
    __extends(MatrixCL, _super);
    function MatrixCL(size, klass) {
        _super.call(this, size, klass, true);
        this._clbuffer = $CL.createBuffer(this._numel * this._data_ctor.BYTES_PER_ELEMENT);
    }
    MatrixCL.prototype.throw_if_destructed = function () {
        if (!this._clbuffer) {
            throw new Error('Attempting use destructed matrix');
        }
    };
    MatrixCL.prototype.write = function (src_typed_array, offset) {
        this.throw_if_destructed();
        $CL.writeBuffer(this._clbuffer, src_typed_array, offset);
    };
    MatrixCL.prototype.read = function (dst_typed_array, offset) {
        this.throw_if_destructed();
        $CL.readBuffer(this._clbuffer, dst_typed_array, offset);
    };
    MatrixCL.prototype.destruct = function () {
        if (this._clbuffer) {
            $CL.releaseBuffer(this._clbuffer);
            this._clbuffer = null;
        }
    };
    MatrixCL.prototype.get = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (args.length == 0) {
            // get scalar
            return this.get_scalar([1]);
        }
        var all_number = args.every(function (v) { return typeof (v) === 'number'; });
        if (all_number) {
            return this.get_scalar(args);
        }
        else {
            if (args.length > 1) {
                return this.get_matrix_nd(args);
            }
            else {
                if (args[0] instanceof Matrix && args[0]._klass === 'logical') {
                    return this.get_matrix_logical(args[0]);
                }
                else {
                    return this.get_matrix_single(args[0]);
                }
            }
        }
    };
    MatrixCL.prototype.get_scalar = function (inds) {
        this._isvalidindexerr(inds);
        var arrayidx = this._getarrayindex(inds);
        var dst_typed_array = new this._data_ctor(1); //read only 1 element
        this.read(dst_typed_array, arrayidx * this._data_ctor.BYTES_PER_ELEMENT);
        return dst_typed_array[0];
        //return rawdata[arrayidx];
    };
    return MatrixCL;
}(Matrix));
module.exports = MatrixCL;
