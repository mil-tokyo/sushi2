if (indexing_error.get() > 0) {expect(() => x.get(5,$M.jsa2mat([5, 1, 1, 4, 2], false, 'int32'))).toThrow();} else {var t = x.get(5,$M.jsa2mat([5, 1, 1, 4, 2], false, 'int32')); if (typeof(t) === 'number') {t = $M.jsa2mat([[t]]);}; expect($M.isequal(t, y)).toBeTruthy();}