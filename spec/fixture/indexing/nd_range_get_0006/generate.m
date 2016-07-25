x = rand(9, 8);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(5,4:end-5);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
