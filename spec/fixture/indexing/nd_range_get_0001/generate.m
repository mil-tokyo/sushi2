x = rand(5, 3);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(end-2:4,end+0:-1:end+0);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
