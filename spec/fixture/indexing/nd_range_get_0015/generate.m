x = rand(2, 3, 2);
y = 0;
z = 0;
indexing_error = 0;
try
y = x(1:end+0,3:end-1,[1 1 1 1 1],1);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
