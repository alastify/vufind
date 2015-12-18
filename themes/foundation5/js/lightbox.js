/*global ajaxLogin, checkSaveStatuses, console, deparam, newAccountHandler, Recaptcha, refreshPageForLogin, registerLightboxEvents, VuFind */

var Lightbox = {
  /**
   * We save the URL and POST data every time we call getByUrl.
   * If we don't have a target a form submission, we use these variables
   * to replicate empty target behaviour by submitting to the current "page".
   */
  lastURL: false,
  lastPOST: false,
  openingURL: false,
  shown: false,      // Is the lightbox deployed?
  XHR: false,        // Used for current in-progress XHR lightbox request
  openStack: [],     // Array of functions to be called after changeContent or the lightbox event 'shown'
  closeStack: [],    // Array of functions to be called and cleared after the lightbox event 'hidden'
  formHandlers: [],  // Full custom handlers for forms; by name
  formCallbacks: [], // Custom functions for forms, called after .submit(); by name

  /**********************************/
  /* ======    INTERFACE     ====== */
  /**********************************/
  /**
   * Register custom open event handlers
   *
   * Think of this as the $(document).ready() of the Lightbox
   * There's actually an alias right below it.
   *
   * If your template has inline JS, $(document).ready() will not fire in the lightbox
   * because it already fired before you opened the lightbox and won't fire again.
   *
   * You can use $.isReady to determine if ready() has already been called
   * so you can trigger your function immediately in the inline JS.
   */
  addOpenAction: function(func) {
    this.openStack.push(func);
  },
  // Alias for addOpenAction
  ready: function(func) {
    this.openStack.push(func);
  },
  /**
   * Register custom close event handlers
   */
  addCloseAction: function(func) {
    this.closeStack.push(func);
  },
  /**
   * For when you want to handle that form all by yourself
   *
   * We recommend using the getLightbox action in the AJAX Controller
   * to ensure you get a lightbox formatted page.
   *
   * If your handler doesn't return false, the form will submit the normal way,
   * with all normal behavior that goes with: redirection, etc.
   */
  addFormHandler: function(formName, func) {
    this.formHandlers[formName] = func;
  },
  /**
   * Register a function to be called when a form submission succeeds
   *
   * We add error checking by default, you never know when error blocks will strike.
   * Passing false to expectsError turns this off. Errors are inserted above *current* content.
   */
  addFormCallback: function(formName, func, expectsError) {
    if(typeof expectsError === "undefined" || expectsError) {
      this.formCallbacks[formName] = function(html) {
        Lightbox.checkForError(html, func);
      };
    } else {
      this.formCallbacks[formName] = func;
    }
  },
  /**
   * We store all the ajax calls in case we need to cancel.
   * This function cancels the previous call and creates a new one.
   */
  ajax: function(obj) {
    if(this.XHR) {
      this.XHR.abort();
    }
    this.XHR = $.ajax(obj);
  },
  /**********************************/
  /* ====== LIGHTBOX ACTIONS ====== */
  /**********************************/
  /**
   * Change the content of the lightbox.
   *
   * Hide the header if it's empty to make more
   * room for content and avoid double headers.
   */
  titleSet: false,
  changeContent: function(html) {
    $('#modal .modal-body').html(html);
    if (Lightbox.shown === false) {
      $('#modal').foundation('reveal', 'open');
      Lightbox.shown = true;
    }
    Lightbox.openActions();
  },

  /**
   * This is the function you call to manually close the lightbox
   */
  close: function(evt) {
    $('#modal').foundation('reveal', 'close'); // This event calls closeActions
  },
  /**
   * This function is attached to the lightbox close event,
   * so it always runs when the lightbox is closed.
   */
  closeActions: function() {
    Lightbox.shown = false;
    Lightbox.openingURL = false;
    // Clean out stack
    while(Lightbox.closeStack.length > 0) {
      var f = Lightbox.closeStack.pop();
      f();
    }
    if(this.XHR) { this.XHR.abort(); }
    // Reset content so we start fresh when we open a lightbox
    $('#modal').removeData('modal');
    $('#modal').find('.modal-title').html('&nbsp;');
    $('#modal').find('.modal-body').html(VuFind.translate('loading') + "&nbsp;...");
  },
  /**
   * Call all the functions we need for when the modal loads
   *
   * Called by the 'shown' event and at the end of changeContent
   */
  openActions: function() {
    for(var i=0;i<Lightbox.openStack.length;i++) {
      Lightbox.openStack[i]();
    }
  },
  /**
   * This function changes the content of the lightbox to a message with a close button
   */
  confirm: function(message) {
    this.changeContent('<div data-alert class="alert-box info" tabindex="0" aria-live="assertive" role="dialogalert">'+message+'</div><button href="#" tabindex="0" class="close tiny" aria-label="Close Alert" onClick="Lightbox.close()">'+VuFind.translate('close')+'</button>');
  },
  success: function(message) {
    this.changeContent('<div data-alert class="alert-box success">'+message+'</div><button href="#" tabindex="0" class="close tiny" aria-label="Close Alert"  onClick="Lightbox.close()">'+VuFind.translate('close')+'</button>');
  },
  /**
   * Regexes a piece of html to find an error alert
   * If one is found, display it
   *
   * If one is not found, return html to a success callback function
   */
  checkForError: function(html, success, type) {
    if(typeof type === "undefined") {
      type = "danger";
    }
    var divPattern = '<div data-alert class="alert-box '+type+'"  tabindex="0" aria-live="assertive" role="dialogalert">';
    var fi = html.indexOf(divPattern);
    if(fi > -1) {
      var li = html.indexOf('</div>', fi+divPattern.length);
      Lightbox.displayError(html.substring(fi+divPattern.length, li).replace(/^[\s<>]+|[\s<>]+$/g, ''), type);
    } else {
      success(html);
    }
  },
  /**
   * Insert an error alert element at the top of the lightbox
   */
  displayError: function(message, type) {
    if(typeof type === "undefined") {
      type = "alert";
    }
    $('#modal .modal-body .alert-box').remove();
    var html = $.parseHTML($('#modal .modal-body').html());
    // Empty or alert only, change to message with button
    if($('#modal .modal-body').html() == VuFind.translate('loading') + "&nbsp;..."
      || (html.length == 1 && $(html).hasClass('alert-'+type))) {
      Lightbox.changeContent('<div data-alert class="alert-box '+type+'" tabindex="0" aria-live="assertive" role="dialogalert">'+message+'</div><button class="button secondary tiny" onClick="Lightbox.close()" >'+VuFind.translate('close')+'</button>');
    // Page without alert
    } else {
      $('#modal .modal-body').prepend('<div data-alert class="alert-box '+type+' alert-dismissible" role="dialogalert"><button type="button" class="close secondary small" href="#" tabindex="0" aria-label="Close Alert" data-dismiss="alert" onClick="Lightbox.close()"><span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button><span class="message">'+message+'</span></div>');
    }
    $('.fa-spinner').remove();
    if (typeof Recaptcha !== "undefined" && Recaptcha.widget) {
      Recaptcha.reload();
    }
    // If the lightbox isn't visible, fix that
    if(this.shown == false) {
      $('#modal').foundation('reveal', 'open');
      this.shown = true;
    }
  },

  /***********************************/
  /* ====== LIGHTBOX REQUESTS ====== */
  /***********************************/
  /**
   * This function creates an XHR request to the URL
   * and handles the response according to the callback.
   *
   * Default callback is changeContent
   */
  getByUrl: function(url, post, callback) {
    if(typeof callback == "undefined") {
      // No custom handler: display return in lightbox
      callback = this.changeContent;
    }
    // If the lightbox isn't visible, fix that
    if(this.shown == false) {
      $('#modal').foundation('reveal', 'open');
      this.shown = true;
    }
    // Create our AJAX request, store it in case we need to cancel later
    this.ajax({
      type:'POST',
      url:url,
      data:post,
      success:function(html) { // Success!
        callback(html);
      },
      error:function(d,e) {
        if (d.status == 200) {
          try {
            var data = JSON.parse(d.responseText);
            Lightbox.changeContent('<p data-alert class="alert-box alert" tabindex="0" aria-live="assertive" role="dialogalert">'+data.data+'</p>');
          } catch(error) {
            Lightbox.changeContent('<p data-alert class="alert-box alert" tabindex="0" aria-live="assertive" role="dialogalert">'+d.responseText+'</p>');
          }
        } else if(d.status > 0) {
          Lightbox.changeContent('<p data-alert class="alert-box alert" tabindex="0" aria-live="assertive" role="dialogalert">'+d.statusText+' ('+d.status+')</p>');
        }
        console.log(e,d); // Error reporting
        console.log(url,post);
      }
    });
    // Store current "page" context for empty targets
    if(this.openingURL === false) {
      this.openingURL = url;
    }
    this.lastURL = url;
    this.lastPOST = post;
    //this.openActions();
    return false;
  },
  /**
   * This is the friendly face to the function above.
   * It converts a Controller and Action into a URL through the AJAX handler
   * with GET and pushes the data and callback to the getByUrl
   */
  get: function(controller, action, get, post, callback) {
    // Build URL
    var url = VuFind.getPath()+'/AJAX/JSON?method=getLightbox&submodule='+controller+'&subaction='+action;
    if(typeof get !== "undefined" && get !== {}) {
      url += '&'+$.param(get);
    }
    if(typeof post == "undefined") {
      post = {};
    }
    return this.getByUrl(url, post, callback);
  },

  /**********************************/
  /* ====== FORM SUBMISSIONS ====== */
  /**********************************/
  /**
   * Returns all the input values from a form as an associated array
   *
   * This function takes a jQuery wrapped form
   * $(event.target) for example
   */
  getFormData: function($form) {
    // Gather all the data
    var inputs = $form.find('*[name]');
    var data = {};
    for(var i=0;i<inputs.length;i++) {
      var currentName = inputs[i].name;
      var array = currentName.substring(currentName.length-2) == '[]';
      if(array && !data[currentName.substring(0,currentName.length-2)]) {
        data[currentName.substring(0,currentName.length-2)] = [];
      }
      // Submit buttons
      if(inputs[i].type == 'submit') {
        if($(inputs[i]).attr('clicked') == 'true') {
          data[currentName] = inputs[i].value;
        }
      // Radio buttons
      } else if(inputs[i].type == 'radio') {
        if(inputs[i].checked) {
          if(array) {
            var n = currentName.substring(0,currentName.length-2);
            data[n].push(inputs[i].value);
          } else {
            data[currentName] = inputs[i].value;
          }
        }
      // Checkboxes
      } else if($(inputs[i]).attr('type') != 'checkbox' || inputs[i].checked) {
        if(array) {
          var f = currentName.substring(0,currentName.length-2);
          data[f].push(inputs[i].value);
        } else {
          data[currentName] = inputs[i].value;
        }
      }
    }
    return data;
  },
  /**
   * This function adds submission events to forms loaded inside the lightbox
   *
   * First, it will check for custom handlers, for those who want to handle everything.
   *
   * Then, it will check for custom form callbacks. These will be added to an anonymous
   * function that will call Lightbox.submit with the form and the callback.
   *
   * Finally, if nothing custom is setup, it will add the default function which
   * calls Lightbox.submit with a callback to close if there are no errors to display.
   *
   * This is a default open action, so it runs every time changeContent
   * is called and the 'shown' lightbox event is triggered
   */
  registerForms: function() {
    var $form = $("#modal").find('form');
    //$form.validator();
    var name = $form.attr('name');
    // Assign form handler based on name
    if(typeof name !== "undefined" && typeof Lightbox.formHandlers[name] !== "undefined") {
      $form.submit(Lightbox.formHandlers[name]);
    // Default action, with custom callback
    } else if(typeof Lightbox.formCallbacks[name] !== "undefined") {
      $form.submit(function(evt){
        if(evt.isDefaultPrevented()) {
          $('.fa.fa-spinner', evt.target).remove();
          return false;
        }
        Lightbox.submit($(evt.target), Lightbox.formCallbacks[name]);
        return false;
      });
    // Default
    } else {
      $form.unbind('submit').submit(function(evt){
        if(evt.isDefaultPrevented()) {
          $('.fa.fa-spinner', evt.target).remove();
          return false;
        }
        Lightbox.submit($(evt.target), function(html){
          Lightbox.checkForError(html, Lightbox.close);
        });
        return false;
      });
    }
  },
  /**
   * The default, automatic form submission
   *
   * This function gleans all the information in a form from the function above
   * Then it uses the action="..." attribute of the form to figure out where to send the data
   * and the method="" attribute to send it the proper way
   *
   * Forms without an action="..." are submitted to the current URL.
   * In the case where we have a form with no action in the lightbox,
   * we emulate that behaviour by submitting the last URL loaded through
   * .getByUrl, stored in lastURL in the Lightbox object.
   */
  submit: function($form, callback) {
    // Default callback is to close
    if(typeof callback == "undefined") {
      callback = this.close;
    }
    var data = this.getFormData($form);
    // If we have an action: parse
    var POST = $form.attr('method') && $form.attr('method').toUpperCase() == 'POST';
    if($form.attr('action')) {
      // Parse action location
      var path = VuFind.getPath();
      var action = $form.attr('action').substring($form.attr('action').indexOf(path)+path.length+1);
      var params = action.split('?');
      action = action.split('/');
      var get = params.length > 1 ? deparam(params[1]) : data['id'] ? {id:data['id']} : {};
      if(POST) {
        this.get(action[0], action[action.length-1], get, data, callback);
      } else {
        this.get(action[0], action[action.length-1], data, {}, callback);
      }
    // If not: fake context by using the previous action
    } else if(POST) {
      this.getByUrl(this.lastURL, data, callback);
    } else {
      this.getByUrl(this.lastURL, {}, callback);
    }
    $(this).find('.modal-body').html(VuFind.translate('loading') + "&nbsp;...");
  }
};

/**
 * This is where you add click events to open the lightbox.
 * We do it here so that non-JS users still have a good time.
 */
$(document).ready(function() {
  // Add handlers to the forms
  Lightbox.addOpenAction(Lightbox.registerForms);
  /**
   * Hook into the Bootstrap close event
   *
   * Yes, the secret's out, our beloved Lightbox is a modal
   */
  $('#modal').on('closed.fndtn.reveal', Lightbox.closeActions);
  /**
   * If a link with the class .modal-link triggers the lightbox,
   * look for a title="" to use as our lightbox title.
   */
  $('.modal-link,.help-link').click(function() {
    var title = $(this).attr('title');
    if(typeof title === "undefined") {
      title = $(this).html();
    }
    $('#modal .modal-title').html(title);
    Lightbox.titleSet = true;
  });

  /******************************
   * LIGHTBOX DEFAULT BEHAVIOUR *
   ******************************/
  Lightbox.addOpenAction(registerLightboxEvents);

  Lightbox.addFormCallback('newList', Lightbox.changeContent);
  Lightbox.addFormCallback('accountForm', newAccountHandler);
  Lightbox.addFormCallback('bulkDelete', function(html) {
    location.reload();
  });
  Lightbox.addFormCallback('bulkSave', function(html) {
    var listID = $('<div>'+html+'</div>').find('[name="listID"]');
    var listUrl = VuFind.getPath() + '/MyResearch/MyList/'+listID.val();
    Lightbox.addCloseAction(refreshPageForLogin);
    Lightbox.success(VuFind.translate('bulk_save_success') + '. <a href="'+listUrl+'">' + VuFind.translate('go_to_list') + '</a>.');
  });
  Lightbox.addFormCallback('bulkRecord', function(html) {
    Lightbox.close();
    checkSaveStatuses();
  });
  Lightbox.addFormCallback('emailSearch', function(html) {
    Lightbox.success(VuFind.translate('bulk_email_success'));
  });
  Lightbox.addFormCallback('saveRecord', function(html) {
    Lightbox.close();
    checkSaveStatuses();
  });

  Lightbox.addFormHandler('exportForm', function(evt) {
    $.ajax({
      url: VuFind.getPath() + '/AJAX/JSON?' + $.param({method:'exportFavorites'}),
      type:'POST',
      dataType:'json',
      data:Lightbox.getFormData($(evt.target)),
      success:function(data) {
        if(data.data.export_type == 'download' || data.data.needs_redirect) {
          document.location.href = data.data.result_url;
          Lightbox.close();
          return false;
        } else {
          Lightbox.changeContent(data.data.result_additional);
        }
      },
      error:function(d,e) {
        //console.log(d,e); // Error reporting
      }
    });
    return false;
  });
  Lightbox.addFormHandler('feedback', function(evt) {
    var $form = $(evt.target);
    // Grabs hidden inputs
    var formSuccess     = $form.find("input#formSuccess").val();
    var feedbackFailure = $form.find("input#feedbackFailure").val();
    var feedbackSuccess = $form.find("input#feedbackSuccess").val();
    // validate and process form here
    var name  = $form.find("input#name").val();
    var email = $form.find("input#email").val();
    var comments = $form.find("textarea#comments").val();
    if (name.length == 0 || comments.length == 0) {
      Lightbox.displayError(feedbackFailure);
    } else {
      Lightbox.get('Feedback', 'Email', {}, {'name':name,'email':email,'comments':comments}, function() {
        Lightbox.changeContent('<div class="alert-box info">'+formSuccess+'</div>');
      });
    }
    return false;
  });
  Lightbox.addFormHandler('loginForm', function(evt) {
    ajaxLogin(evt.target);
    return false;
  });

  // Feedback
  $('#feedbackLink').click(function() {
    return Lightbox.get('Feedback', 'Home');
  });
  // Help links
  $('.help-link').click(function() {
    var split = this.href.split('=');
    return Lightbox.get('Help','Home',{topic:split[1]});
  });
  // Hierarchy links
  $('.hierarchyTreeLink a').click(function() {
    var id = $(this).parent().parent().parent().find(".hiddenId")[0].value;
    var hierarchyID = $(this).parent().find(".hiddenHierarchyId")[0].value;
    return Lightbox.get('Record','AjaxTab',{id:id},{hierarchy:hierarchyID,tab:'HierarchyTree'});
  });
  // Login link
  $('#loginOptions a.modal-link').click(function() {
    return Lightbox.get('MyResearch','UserLogin');
  });
  // Email search link
  $('.mailSearch').click(function() {
    return Lightbox.get('Search','Email',{url:document.URL});
  });
  // Save record links
  $('.result .save-record').click(function() {
    var parts = this.href.split('/');
    return Lightbox.get(parts[parts.length-3],'Save',{id:$(this).attr('data-id')});
  });
});