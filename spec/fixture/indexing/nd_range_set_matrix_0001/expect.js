if (indexing_error.get() > 0) {expect(() => x.set($M.colon($M.end-2,4),$M.colon($M.end+0,-1,$M.end+0), y)).toThrow();} else {x.set($M.colon($M.end-2,4),$M.colon($M.end+0,-1,$M.end+0), y); expect($M.isequal(x, z)).toBeTruthy();}