export import Matrix = require('./matrix');
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
