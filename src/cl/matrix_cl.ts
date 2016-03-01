import Matrix = require('../matrix');

class MatrixCL extends Matrix {
  _clbuffer: any;
  constructor(size: number[], klass?: string) {
    super(size, klass, true);
  }
  
  write() {
    
  }
  
  read() {
    
  }
}

export = MatrixCL;
