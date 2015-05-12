/*global module:false*/
module.exports = function(grunt) {

  var banner = '/*! <%= pkg.name %> @ v<%= pkg.version %> from <%= pkg.repository.url %> - ' + 
               '<%= grunt.template.today("yyyy-mm-dd") %> */\n';

  // Project configuration.
  grunt.initConfig({
    // Load package config  
    pkg: grunt.file.readJSON('package.json'),

    // Task configuration.
    jshint: {
      options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: true,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        unused: true,
        boss: true,
        eqnull: true,
        browser: true,
      },
      files: [
        "Gruntfile.js",
        "bower.json",
        "package.json",
      ],
      lib: {
        options: {
          browser: true,
          predef: ['define']
        },
        src: "src/**/*.js",
      }
    },
    jsdoc: {
      dist: {
        src: "<%= jshint.lib.src %>",
        options: {
          destination: "api"
        }
      }
    },
    concat: {
        options: {
            banner: banner
        },
        unminified: {
            src: ['src/pym.js'],
            dest: 'dist/kkr-pym.<%= pkg.version %>.js'
        }
    },
    uglify: {
      options: {
        banner: banner
      },
      minified: {
        files: {
          'dist/kkr-pym.<%= pkg.version %>.min.js': ['src/pym.js']
        }
      }
    },
    watch: {
      jshint: {
        files: "<%= jshint.files  %>",
        tasks: ["jshint"]
      },
      lib: {
        files: "<%= jshint.lib.src %>",
        tasks: ["jshint:lib"]
      }
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks("grunt-contrib-jshint");
  grunt.loadNpmTasks("grunt-contrib-watch");
  grunt.loadNpmTasks("grunt-jsdoc");
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-concat');

  // Default task.
  grunt.registerTask("default", ["jshint", "concat", "uglify"]);
};
