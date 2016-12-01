#!/usr/bin/env node
'use strict';

const vfs = require('vinyl-fs'),
    path = require('path'),
    through2 = require('through2').obj,
    vinylFile = require('vinyl-file');

const Builder = require('./file-builder'),
    builder = new Builder();

var argv = require('yargs')
    .usage('Usage: $0 <command> [options]')
    .command('create <name> [path] [styles] [script]', 'Create a new Polymer template for element in current directory', {}, createTemplate)
    .describe('path', 'Path to directory relative to cwd where you want to create template')
    .string('path')
    .describe('styles', 'Extract styles to separate file. Can except file extension as argument ([css, scss, less])')
    .alias('s', 'styles')
    .describe('script', 'Extract script to separate file.')
    .alias('j', 'script')
    .describe('imports', 'Import dependencies using html comment')
    .alias('i', 'imports')
    .boolean('i')
    .example('$0 create my-template ./custom_path/ -s scss -ji', 'Create template in ./custom_path/my-template with injected scss styles and script')
    .help('h')
    .alias('h', 'help')
    .argv;


function createTemplate(arg) {
    // console.log(arg);
    var template_dir = path.normalize(__dirname + '/templates'),
        output_dir = arg.path ? path.resolve(String(arg.path)) : process.cwd();

    if (arg.name.search(/\s/) >= 0) throw new Error('Provided name is not allowed');

    vfs.src(path.normalize(template_dir + '/template.html'))
        .pipe(through2(function (file, enc, callback) {
            var content = String(file.contents)
                .replace(/\{\{name}}/g, arg.name);

            //js imports
            if (arg.j || arg.script) {
                content = content.replace(/<script>[\s\S]*<\/script>/, `<!-- inject scripts './${arg.name}.js'-->`);
                var js_file = vinylFile.readSync(path.normalize(template_dir + '/template.js'), {base: template_dir});
                js_file.contents = new Buffer(String(js_file.contents).replace(/\{\{name}}/g, arg.name));
                this.push(js_file);
            }

            //styles imports
            if (arg.s || arg.styles) {
                let extension = arg.s || arg.styles || 'css';

                if (typeof extension !== 'string' && (arg.s === true || arg.styles === true)) extension = 'css';
                if (['css', 'scss', 'less'].indexOf(extension) < 0) throw new Error('Provided styles extension is incorrect');

                content = content.replace(/<style>[\s\S]*<\/style>/, `<!-- inject styles './${arg.name}.${extension}'-->`);
                this.push(vinylFile.readSync(path.normalize(template_dir + `/template.${extension}`), {base: template_dir}))
            }

            //add import comment
            if (arg.i || arg.imports) content = '<!--import [polymer]-->\n\n' + content;


            file.contents = new Buffer(content);
            callback(null, file)
        }))
        .pipe(through2(function(file, enc, callback) {
            file.basename = `${arg.name}${file.extname}`;
            callback(null, file);
        }))
        .pipe(vfs.dest(path.normalize(`${output_dir}/${arg.name}/`)));
}

module.exports = function (custom_paths, reduce_imports) {
    return builder.start(custom_paths, reduce_imports);
};