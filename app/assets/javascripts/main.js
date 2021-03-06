//= require helpers
//= require store.min
//= require jquery.ba-hashchange.min
//= require slick.grid
//= require routing

var keyCode = {
    ENTER: 13
};

$(document).ready(function () {

    // resize the main-area to correct height
    resizeMain();
    $(window).resize(function () { resizeMain(); });

    function resizeMain() {
        var h = $(window).height() - $('#wrap > header').outerHeight() - $('#player').outerHeight();
        var w = $(window).width() - $('#sidebar').outerWidth();
        $('#main').css('height', h);
        $('#content-wrap').css('width', w);

        var h2 = h - $('.page-header').innerHeight();
        $('.grid-container').css('height', h2);

        if (grid) {
            grid.resizeCanvas();
        }
    }


    // ::: USER MENU :::

    $(window).hashchange(function () {
        Routing.ResolveCurrent();
    });
    

    // ::: INIT SONGLIST / GRID OMG SO BIG SECTION :::

    var grid = null;
    var dataView = new Slick.Data.DataView({ inlineFilters: true });

    var audio = $('#player audio');
    audio.css('display', 'none');

    var playerTrack = $('#player-song .track');
    var playPause = $('#play-pause');
    var prevButton = $('#prev');
    var nextButton = $('#next');
    var elapsed = $('#player-time .elapsed');
    var duration = $('#player-time .duration');

    var song_scrobbled = false;
    var scrobble_time = 240;

    var repeatButton = $('#repeat'),
        shuffleButton = $('#shuffle'),
        shuffle = false,
        repeat = false

    function newToggleButton(button, key, value) {
        if (store.get(key)) {
            value = store.get(key);
        }
        
        if (value) {
            button.addClass('enabled');
        }

        button.click(function (e) {
            e.preventDefault();

            value = !value;
            store.set(key, value);

            $(this).toggleClass('enabled');
        });
    }

    newToggleButton(repeatButton, 'repeat', repeat);
    newToggleButton(shuffleButton, 'shuffle', shuffle);

    function getShuffle() {
        if (store.get('shuffle')) {
            return store.get('shuffle');
        }
        
        return false;
    }

    // volume slider
    var volume = 0.3;
    if (store.get('volume')) {
        volume = parseFloat(store.get('volume'));
        if (volume >= 0 && volume <= 1.0) {
            audio[0].volume = volume;
        }
    }

    $('#player-volume-slider').slider({
        orientation: 'horizontal',
        value: volume * 100,
        max: 100,
        min: 0,
        range: 'min',
        slide: function (event, ui) {
            var vol = parseFloat(ui.value/100/2);
            audio[0].volume = vol;
        },
        stop: function (event, ui) {
            store.set('volume', parseFloat(ui.value/100));
        }
    });

    // seekbar
    var seekbar = $('#seekbar-slider');
    var user_is_seeking = false;
    seekbar.slider({
        orientation: 'horizontal',
        disabled: true,
        value: 0,
        max: 100,
        min: 0,
        range: 'min',
        slide: function (event, ui) {
        },
        start: function(event, ui) {
            user_is_seeking = true;
        },
        stop: function(event, ui) {
            audio[0].currentTime = ui.value;
            user_is_seeking = false;
        }
    });

    playPause.click(function (e) {
        e.preventDefault();

        if (grid.playingSongId == null) {
            grid.nextSong();
            return;
        }

        if (audio[0].paused) {
            audio[0].play();
        }
        else {
            audio[0].pause();
        }
    });

    nextButton.click(function (e) {
        e.preventDefault();
        grid.nextSong();
    });

    prevButton.click(function (e) {
        e.preventDefault();
        grid.prevSong();
    });

    playerTrack.dblclick(function (e) {
        e.preventDefault();
        
        var row = dataView.getRowById(grid.playingSongId);
        grid.scrollRowIntoView(row);
    });


    // audio player events

    audio.bind('play', function() {
        playPause.addClass('playing');
    });

    audio.bind('pause', function() {
        playPause.removeClass('playing');
    });

    audio.bind('ended', function () {
        grid.nextSong();
    });

    audio.bind('timeupdate', function () {
        var elaps = parseInt(audio[0].currentTime);

        elapsedTimeChanged(elaps);

        if (!user_is_seeking) {
            seekbar.slider('option', 'value', elaps);
        }
    });

    audio.bind('durationchange', function () {
        var dur = parseInt(audio[0].duration);
        durationChanged(dur);
        seekbar.slider('option', 'disabled', false);
    });

    var error_counter = 0;

    audio.bind('error', function () {
        if (error_counter > 2) {
            audio[0].pause();
            error_counter = 0;
            return;
        }

        grid.nextSong();
        error_counter = error_counter + 1;
    });


    // sidebar drag & drop

    jQuery.event.special.drag.defaults.distance = 7;


    // SlickGrid

    var columns = [
        { id: 'np', resizable: false, width: 22 },
        { id: 'artist', name: 'Artist', field: 'artist', sortable: true },
        { id: 'tracknum', name: '', field: 'tracknum', sortable: false, resizable: false, cssClass: 'tracknum', width: 30 },
        { id: 'title', name: 'Title', field: 'title', sortable: true },
        { id: 'album', name: 'Album', field: 'album', sortable: true },
        { id: 'duration', name: 'Duration', field: 'nice_length', sortable: true, cssClass: 'duration', width: 30 },
        { id: 'path', name: '', field: 'path' }
    ];

    var options = {
        editable: false,
        forceFitColumns: true,
        enableAutoTooltips: true,
        enableCellNavigation: true,
        enableColumnReorder: false,
        multiSelect: true,
        rowHeight: 22
    };

    $.ajax({
        url: '/songs/index',
        dataType: 'json',
        error: function (xhr, status, error) {
            console.log(xhr);
            console.log(status);
            console.log(error);
        },
        success: function(data) {

            grid = new Slick.Grid("#slickgrid", dataView, columns, options);
            grid.setSelectionModel(new Slick.RowSelectionModel());

            // remove 'path' column
            grid.setColumns(columns.slice(0, -1));


            // events:

            grid.onClick.subscribe(function (e) {
                var cell = grid.getCellFromEvent(e);
                grid.setSelectedRows([cell.row]);
            });

            grid.onDblClick.subscribe(function (e) {
                var cell = grid.getCellFromEvent(e);
                var dataItem = grid.getDataItem(cell.row);

                grid.playSong(dataItem.id);

                e.stopPropagation();
            });

            grid.onKeyDown.subscribe(function (e) {
                if (e.keyCode == keyCode.ENTER) {
                    
                    var rows = grid.getSelectedRows();
                    if (!rows || rows.length <= 0) {
                        return;
                    }

                    var dataItem = grid.getDataItem(rows[0]);
                    
                    grid.playSong(dataItem.id);

                    e.stopPropagation();
                }
            });

            grid.onSelectedRowsChanged.subscribe(function (e) {
                //var row = grid.getSelectedRows()[0];
            });

            grid.onSort.subscribe(function (e, args) {
                var sortcol = args.sortCol.field;

                function comparer(a, b) {
                    var x = a[sortcol],
                        y = b[sortcol];

                    if (!x) { return -1; }
                    if (!y) { return 1; }

                    if (sortcol == 'album') {
                        x = a['album'] + ' ' + a['tracknum'];
                        y = b['album'] + ' ' + b['tracknum'];
                    }
                    else if (sortcol == 'artist') {
                        x = a['artist'] + ' ' + a['album'] + ' ' + a['tracknum'];
                        y = b['artist'] + ' ' + b['album'] + ' ' + b['tracknum'];
                    }

                    return naturalsort(x, y);
                }

                dataView.sort(comparer, args.sortAsc);
            });

            // dragging

            grid.onDragInit.subscribe(function (e, dd) {
                // we're handling drags
                e.stopImmediatePropagation();
            });

            grid.onDragStart.subscribe(function (e, dd) {

                var cell = grid.getCellFromEvent(e);
                var data = {};
                var song_count = 0;

                // check if dragging selected rows
                var rows = grid.getSelectedRows();
                var draggingSelectedRows = false;

                for (var i = 0; i < rows.length; i++) {
                    var dataItem = grid.getDataItem(rows[i]);
                    data[i] = dataItem;
                    if (rows[i] == cell.row) {
                        draggingSelectedRows = true;
                    }
                    song_count++;
                }

                if (draggingSelectedRows == false) {
                    var dataItem = grid.getDataItem(cell.row);
                    data = {};
                    data[0] = dataItem;
                    song_count = 1;
                }

                dd.bestDataEver = data;

                DragTooltip.show(dd.startX, dd.startY, song_count + ' song');

                if (song_count != 1) {
                    DragTooltip.append('s');
                }

                // make playlists hilight
                $('#sidebar .playlists li').addClass('targeted');

                // tell grid that we're handling drags!
                e.stopImmediatePropagation();
            });

            grid.onDrag.subscribe(function (e, dd) {
                DragTooltip.update(e.clientX, e.clientY);

                var drop_target = $(document.elementFromPoint(e.clientX, e.clientY));

                if (drop_target == undefined || drop_target.parent().parent().hasClass('playlists') == false) {
                    // these are not the drops you are looking for
                    $('#sidebar .playlists li').removeClass('hover');
                    return;
                }

                $('#sidebar .playlists li').removeClass('hover');
                drop_target.parent().addClass('hover');
            });

            grid.onDragEnd.subscribe(function (e, dd) {
                DragTooltip.hide();

                $('#sidebar .playlists li').removeClass('targeted').removeClass('hover');

                var drop_target = $(document.elementFromPoint(e.clientX, e.clientY));

                if (drop_target == undefined || drop_target.parent().hasClass('.playlists') == false) {
                    // these are not the drops you are looking for
                    return;
                }

                // TODO: add dragged things into playlist (if things can be added)
            });


            // own extensions:

            grid.playingSongId = null;

            grid.getPlayingSong = function () {
                if (grid.playingSongId === null) {
                    return null;
                }
                else {
                    return dataView.getItemById(grid.playingSongId);
                }
            };

            grid.playSong = function (id) {
                var row = dataView.getRowById(id);

                if (row == undefined) {
                    return; // song is not on the current list
                }

                var song = dataView.getItemById(id);

                playSong(song);
                grid.playingSongId = song.id;

                // now playing icon
                grid.removeCellCssStyles('currentSong_playing');

                var np_cells = {}; np_cells[row] = { np: 'playing' };
                grid.addCellCssStyles('currentSong_playing', np_cells);

                grid.setSelectedRows([row]);
                grid.scrollRowIntoView(row);
            };

            grid.playSongAtRow = function (row) {
                var song = dataView.getItem(row); // getItem == getItemAtRow
                grid.playSong(song.id);
            };

            grid.prevSong = function () {
                var number_of_rows = grid.getDataLength();
                var new_row = number_of_rows - 1;
                var current_row = dataView.getRowById(grid.playingSongId);

                if (current_row == undefined) {
                    // current song is not in the grid, stop playing
                    stop();
                    return;
                }

                if ((current_row - 1) >= 0) {
                    new_row = current_row - 1;
                }

                grid.playSongAtRow(new_row);
            };

            grid.nextSong = function () {
                var number_of_rows = grid.getDataLength();
                var new_row = 0;
                var current_row = -1;

                if (grid.playingSongId != null) {
                    current_row = dataView.getRowById(grid.playingSongId);

                    if (current_row == undefined) {
                        // current song is not in the grid, stop playing
                        stop();
                        return;
                    }
                }

                var shuffle = getShuffle();

                if (shuffle) {
                    new_row = randomToN(number_of_rows);
                }
                else if ((current_row + 1) < number_of_rows) {
                    new_row = current_row + 1;
                }

                grid.playSongAtRow(new_row);
            };

            // wire up model events to drive the grid
            dataView.onRowCountChanged.subscribe(function (e, args) {
                grid.updateRowCount();
                grid.render();
            });

            dataView.onRowsChanged.subscribe(function (e, args) {
                grid.invalidateRows(args.rows);
                grid.render();
            });

            var searchString = '';

            function myFilter(item, args) {
                if (args.searchString == "") {
                    return true;
                }

                var searchStr = args.searchString.toLowerCase();

                searchStr = searchStr.split(' ');

                var match = true;

                for (var i = 0; i < searchStr.length; i++) {
                    var str = searchStr[i];
                    if ((item["title"] && item["title"].toLowerCase().indexOf(str) != -1)
                        || (item["artist"] && item["artist"].toLowerCase().indexOf(str) != -1)
                        || (item["album"] && item["album"].toLowerCase().indexOf(str) != -1)) {
                        match = true;
                    }
                    else {
                        return false;
                    }
                }

                return match;
            }

            // wire up the search textbox to apply the filter to the model
            $('#search').keyup(function (e) {
                // clear on Esc
                if (e.which == 27) {
                    this.value = "";
                }

                searchString = this.value;
                updateFilter();
            });

            $('.search .clear').click(function (e) {
                $('#search').val('');
                searchString = '';
                updateFilter();

                e.preventDefault();
                e.stopPropagation();
            });

            function updateFilter() {
                dataView.setFilterArgs({
                    searchString: searchString
                });
                dataView.refresh();
            }

            // initialize data view model after events have been hooked up
            dataView.beginUpdate();
            dataView.setItems(data);
            dataView.setFilterArgs({
                searchString: searchString
            });
            dataView.setFilter(myFilter);
            dataView.endUpdate();

            dataView.syncGridSelection(grid, false);
            dataView.syncGridCellCssStyles(grid, 'currentSong_playing');

            // update playlist meta
            $('.page-header .count').html(data.length);
            if (data.length == 1) {
                $('.page-header .text').html('song');
            }
            else {
                $('.page-header .text').html('songs');
            }
        }
    }); /* end $.ajax */

    // enable buttons
    $('#player-buttons button').removeAttr('disabled');

    function playSong(song) {
        var uri = '/songs/play/?file=' + encodeURIComponent(song.path);

        audio.attr('src', uri);
        audio[0].play();

        playerTrack.text(song.nice_title);

        // set now playing
        updateNowPlaying(song);

        // set scrobbling time
        scrobble_time = Math.floor(song.length/2, 10);
        
        if (scrobble_time > 240) {
            scrobble_time = 240;
        }

        // don't scrobble songs that are under 30 secs (last.fm rule)
        if (scrobble_time <= 15) {
            song_scrobbled = true;
        }
        else {
            song_scrobbled = false;
        }
    }

    function stop() {
        if (!audio[0].paused) {
            audio[0].pause();
            audio[0].src = '';
        }
        grid.playingSongId = null;
        
        elapsedTimeChanged(0);
        durationChanged(0);
        seekbar.slider('value', 0);
        seekbar.slider('option', 'disabled', true);
        playerTrack.text('None');
    }

    function durationChanged(dur) {
        var mins = Math.floor(dur/60, 10),
            secs = dur - mins*60;

        duration.text((mins > 9 ? mins : '0' + mins) + ':' + (secs > 9 ? secs : '0' + secs));

        seekbar.slider('option', 'max', dur);
    }

    function elapsedTimeChanged(elaps) {
        var mins = Math.floor(elaps/60, 10),
            secs = elaps - mins*60;

        elapsed.text((mins > 9 ? mins : '0' + mins) + ':' + (secs > 9 ? secs : '0' + secs));

        if (song_scrobbled === false && scrobble_time < elaps) {
            song_scrobbled = true;
            scrobble();
        }
    }

    function scrobble() {
        var song = grid.getPlayingSong();

        var uri = '/songs/scrobble/?artist=' +
            encodeURIComponent(song.artist) +
            '&title=' + encodeURIComponent(song.title);

        $.ajax({
            url: uri,
            success: function () {
                //console.log('Scrobbled song: ' + song.artist + ' - ' + song.title);
            },
            error: function () {
                //console.log('Scrobbling failed!');
            }
        });
    }

    function updateNowPlaying(song) {
        var uri = '/songs/now_playing/?artist=' +
                  encodeURIComponent(song.artist) +
                  '&title=' + encodeURIComponent(song.title);

        $.ajax({
            url: uri,
            success: function () {
                //console.log('Updated now playing to: ' + song.artist + ' - ' + song.title);
            },
            error: function () {
                //console.log('Now playing update failed!');
            }
        });
    }
});
