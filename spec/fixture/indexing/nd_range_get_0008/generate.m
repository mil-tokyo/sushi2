x = rand(7, 8);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(end-3:-4:4,6,2);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
