x = rand(7, 3);
y = 0;
z = 0;
indexing_error = 0;
try
y = x([4 6 5 3 1],[1 3 2],2);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
