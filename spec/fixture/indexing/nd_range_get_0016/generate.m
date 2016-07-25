x = rand(8, 6, 6);
y = 0;
z = 0;
indexing_error = 0;
try
y = x([7 2 7 5 2],2,2);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
