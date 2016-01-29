class Matrix {
    _size: number[];
    _numel: number;
    _klass: string;
    _data: Float32Array | Int32Array | Uint8Array;//allocated in constructor
    _strides: number[];// in typedarray index (not byte)

    constructor(size: number[], klass: string = 'single', noalloc: boolean = false) {
        var _size: number[] = Array.prototype.slice.call(size);//copy
        //verify size
        var tmpnumel: number = 1;
        var strides: number[] = [];
        var last_none_one_dim = 0;
        if (_size.length < 2) {
            throw new Error('matrix must have at least 2 dimensions');
        }
        for (var i = 0; i < _size.length; i++) {
            var dimsize = _size[i];
            if (typeof (dimsize) !== 'number' || dimsize < 0 || !Matrix._isinteger(dimsize)) {
                throw new Error('size is invalid');
            }
            if (dimsize != 1) {
                last_none_one_dim = i;
            }
            strides.push(tmpnumel);
            tmpnumel *= dimsize;
        }
        this._numel = tmpnumel;
        //remove tail dimensions with size 1 (retain minimum 2 dimensions)
        last_none_one_dim = Math.max(last_none_one_dim, 1) + 1;
        _size.splice(last_none_one_dim);
        strides.splice(last_none_one_dim);
        this._size = _size;
        this._strides = strides;

        if (!Matrix._isvalidklass(klass)) {
            throw new Error('unknown klass');
        }
        this._klass = klass;
        if (!noalloc) {
            this._alloccpu();
        }
    }

    static _isinteger(x) {
        return Math.round(x) == x;
    }

    static _isvalidklass(klass) {
        return klass == 'single' || klass == 'int32' || klass == 'uint8' || klass == 'logical';
    }

    _alloccpu() {
        // allocate cpu buffer if not exist
        if (!this._data) {
            switch (this._klass) {
                case 'single':
                    this._data = new Float32Array(this._numel);
                    break;
                case 'int32':
                    this._data = new Int32Array(this._numel);
                    break;
                case 'uint8':
                case 'logical':
                    this._data = new Uint8Array(this._numel);
                    break;
                default:
                    throw new Error('Unknown data class');
                    break;
            }
        }

        return this._data;
    }
    
    _isvalidindex(inds: number[]): boolean {
        if (this._numel == 0) {
            // if matrix have zero dimension, all index is invalid
            return false;
        }
        if (inds.length == 0) {
            return false;
        } else if (inds.length == 1) {
            return Matrix._isinteger(inds[0]) && inds[0] > 0 && inds[0] <= this._numel;
        } else {
            for (var dim = 0; dim < inds.length; dim++) {
                var ind = inds[dim];
                // if dimensions of inds is more than matrix dimensions, only 1 is ok for the extra dimension
                if (Matrix._isinteger(ind) && ind > 0 && (ind <= (this._size[dim] || 1))) {
                    //ok
                } else {
                    return false;
                }
            }
        }

        return true;
    }

    _isvalidindexerr(inds: number[]): void {
        if (!this._isvalidindex(inds)) {
            throw new Error('Invalid index');
        }
    }

    _getarrayindex(inds: number[]): number {
        // assume inds is valid
        var idx = 0;
        for (var dim = 0; dim < inds.length; dim++) {
            idx += (inds[dim] - 1) * (this._strides[dim] || 0);//trailing 1 does not affect
        }

        return idx;
    }

    static numel(A: Matrix): number {
        return A._numel;
    }

    static size(X: Matrix): Matrix;
    static size(X: Matrix, dim: number): number;
    static size(X: Matrix, dim?: number): any {
        if (dim == undefined) {
            return Matrix.fromjsa([X._size]);
        } else {
            return X._size[dim - 1];
        }
    }

    static sizejsa(X: Matrix): number[] {
        return X._size;
    }

    static zeros(...args: any[]): Matrix {
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
                }
            } else {
                mat = new Matrix(args, klass);
            }
        }

        return mat;
    }

    static fromjsa(ary: any, klass?: string): Matrix {
        // get dimension
        var mat;
        if (ary.length == 0) {
            //0x0 matrix
            mat = new Matrix([0, 0], klass);
        } else {
            var dim_size: number[] = [];
            //treat as row-major memory order; ary[row][col][dim3][dim4]
            var inner = ary;
            while (!!inner.length) {
                dim_size.push(inner.length);
                inner = inner[0];
            }
            mat = new Matrix(dim_size, klass);
            var rawdata = mat._alloccpu();
            
            //TODO: support n-d array
            for (var row = 0; row < dim_size[0]; row++) {
                var rowdata = ary[row];
                for (var col = 0; col < dim_size[1]; col++) {
                    var val = rowdata[col];
                    mat.set(row + 1, col + 1, val);
                }
            }
        }

        return mat;
    }

    get(...inds: number[]): number {
        var rawdata = this._alloccpu();
        this._isvalidindexerr(inds);
        var arrayidx = this._getarrayindex(inds);
        return rawdata[arrayidx];
    }

    set(...inds_val: number[]): void {
        var rawdata = this._alloccpu();
        var inds = inds_val.concat();
        var val = inds.pop();
        this._isvalidindexerr(inds);
        var arrayidx = this._getarrayindex(inds);
        rawdata[arrayidx] = val;
    }

    toString(): string {
        var s = '';
        var rows = this._size[0], cols = this._size[1];
        var rawdata = this._alloccpu();
        for (var row = 0; row < rows; row++) {
            for (var col = 0; col < cols; col++) {
                s += rawdata[col * rows + row] + '\t';
            }
            s += '\n';
        }
        return s;
    }

    disp(X?: any): void {
        var s = '';
        if (this !== void 0) {
            s = this.toString();
        } else {
            s = X.toString();
        }
        console.log(s);
    }
}

export = Matrix;
