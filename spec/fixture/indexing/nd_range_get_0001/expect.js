if (indexing_error.get() > 0) {expect(() => x.get($M.colon($M.end-2,4),$M.colon($M.end+0,-1,$M.end+0))).toThrow();} else {var t = x.get($M.colon($M.end-2,4),$M.colon($M.end+0,-1,$M.end+0)); if (typeof(t) === 'number') {t = $M.jsa2mat([[t]]);}; expect($M.isequal(t, y)).toBeTruthy();}