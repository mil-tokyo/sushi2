"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Matrix = require('../matrix');
var MatrixCL = (function (_super) {
    __extends(MatrixCL, _super);
    function MatrixCL(size, klass) {
        _super.call(this, size, klass, true);
    }
    MatrixCL.prototype.write = function () {
    };
    MatrixCL.prototype.read = function () {
    };
    return MatrixCL;
}(Matrix));
module.exports = MatrixCL;
