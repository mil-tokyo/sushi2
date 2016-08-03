x = rand(9, 2, 6);
y = 0;
z = 0;
indexing_error = 0;
try
y = x([5 6 2 1 7],[12 5 10 3 11]);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
