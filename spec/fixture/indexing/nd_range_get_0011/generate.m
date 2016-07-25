x = rand(6, 3, 3);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(end-4:0:end-4,2,3:end-1);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
