if (indexing_error.get() > 0) {expect(() => x.get($M.jsa2mat([7, 2, 7, 5, 2], false, 'int32'),2,2)).toThrow();} else {var t = x.get($M.jsa2mat([7, 2, 7, 5, 2], false, 'int32'),2,2); if (typeof(t) === 'number') {t = $M.jsa2mat([[t]]);}; expect($M.isequal(t, y)).toBeTruthy();}