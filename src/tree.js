/*************************************************
 * Base classes of the MathQuill virtual DOM tree
 *
 * Only doing tree node manipulation via these
 * adopt/ disown methods guarantees well-formedness
 * of the tree.
 ************************************************/

// L = 'left'
// R = 'right'
//
// the contract is that they can be used as object properties
// and (-L) === R, and (-R) === L.
var L = -1;
var R = 1;

function prayDirection(dir) {
  pray('a direction was passed', dir === L || dir === R);
}

/**
 * Tiny extension of jQuery adding directionalized DOM manipulation methods.
 *
 * Funny how Pjs v3 almost just works with `jQuery.fn.init`.
 *
 * jQuery features that don't work on $:
 *   - jQuery.*, like jQuery.ajax, obviously (Pjs doesn't and shouldn't
 *                                            copy constructor properties)
 *
 *   - jQuery(function), the shortcut for `jQuery(document).ready(function)`,
 *     because `jQuery.fn.init` is idiosyncratic and Pjs doing, essentially,
 *     `jQuery.fn.init.apply(this, arguments)` isn't quite right, you need:
 *
 *       _.init = function(s, c) { jQuery.fn.init.call(this, s, c, $(document)); };
 *
 *     if you actually give a shit (really, don't bother),
 *     see https://github.com/jquery/jquery/blob/1.7.2/src/core.js#L889
 *
 *   - jQuery(selector), because jQuery translates that to
 *     `jQuery(document).find(selector)`, but Pjs doesn't (should it?) let
 *     you override the result of a constructor call
 *       + note that because of the jQuery(document) shortcut-ness, there's also
 *         the 3rd-argument-needs-to-be-`$(document)` thing above, but the fix
 *         for that (as can be seen above) is really easy. This problem requires
 *         a way more intrusive fix
 *
 * And that's it! Everything else just magically works because jQuery internally
 * uses `this.constructor()` everywhere (hence calling `$`), but never ever does
 * `this.constructor.find` or anything like that, always doing `jQuery.find`.
 */
var $ = P(jQuery, function(_) {
  _.insDirOf = function(dir, el) {
    return dir === L ?
      this.insertBefore(el.first()) : this.insertAfter(el.last());
  };
  _.insAtDirEnd = function(dir, el) {
    return dir === L ? this.prependTo(el) : this.appendTo(el);
  };
});

var Point = P(function(_) {
  _.parent = 0;
  _[L] = 0;
  _[R] = 0;

  _.init = function(parent, leftward, rightward) {
    this.parent = parent;
    this[L] = leftward;
    this[R] = rightward;
  };
});

/**
 * MathQuill virtual-DOM tree-node abstract base class
 */
var Node = P(function(_) {
  _[L] = 0;
  _[R] = 0
  _.parent = 0;

  _.init = function() {
    this.endChild = {};
    this.endChild[L] = 0;
    this.endChild[R] = 0;
  };

  _.children = function() {
    return Fragment(this.endChild[L], this.endChild[R]);
  };

  _.eachChild = function(fn) {
    return this.children().each(fn);
  };

  _.foldChildren = function(fold, fn) {
    return this.children().fold(fold, fn);
  };

  _.adopt = function(parent, leftward, rightward) {
    Fragment(this, this).adopt(parent, leftward, rightward);
    return this;
  };

  _.disown = function() {
    Fragment(this, this).disown();
    return this;
  };
});

/**
 * An entity outside the virtual tree with one-way pointers (so it's only a
 * "view" of part of the tree, not an actual node/entity in the tree) that
 * delimits a doubly-linked list of sibling nodes.
 * It's like a fanfic love-child between HTML DOM DocumentFragment and the Range
 * classes: like DocumentFragment, its contents must be sibling nodes
 * (unlike Range, whose contents are arbitrary contiguous pieces of subtrees),
 * but like Range, it has only one-way pointers to its contents, its contents
 * have no reference to it and in fact may still be in the visible tree (unlike
 * DocumentFragment, whose contents must be detached from the visible tree
 * and have their 'parent' pointers set to the DocumentFragment).
 */
var Fragment = P(function(_) {
  _.init = function(leftEnd, rightEnd) {
    pray('no half-empty fragments', !leftEnd === !rightEnd);

    this.end = {};

    if (!leftEnd) return;

    pray('left end node is passed to Fragment', leftEnd instanceof Node);
    pray('right end node is passed to Fragment', rightEnd instanceof Node);
    pray('leftEnd and rightEnd have the same parent',
         leftEnd.parent === rightEnd.parent);

    this.end[L] = leftEnd;
    this.end[R] = rightEnd;
  };

  function prayWellFormed(parent, leftward, rightward) {
    pray('a parent is always present', parent);
    pray('leftward is properly set up', (function() {
      // either it's empty and rightward is the left end child (possibly empty)
      if (!leftward) return parent.endChild[L] === rightward;

      // or it's there and its [R] and .parent are properly set up
      return leftward[R] === rightward && leftward.parent === parent;
    })());

    pray('rightward is properly set up', (function() {
      // either it's empty and leftward is the right end child (possibly empty)
      if (!rightward) return parent.endChild[R] === leftward;

      // or it's there and its [L] and .parent are properly set up
      return rightward[L] === leftward && rightward.parent === parent;
    })());
  }

  _.adopt = function(parent, leftward, rightward) {
    prayWellFormed(parent, leftward, rightward);

    var self = this;
    self.disowned = false;

    var leftEnd = self.end[L];
    if (!leftEnd) return this;

    var rightEnd = self.end[R];

    if (leftward) {
      // NB: this is handled in the ::each() block
      // leftward[R] = leftEnd
    } else {
      parent.endChild[L] = leftEnd;
    }

    if (rightward) {
      rightward[L] = rightEnd;
    } else {
      parent.endChild[R] = rightEnd;
    }

    self.end[R][R] = rightward;

    self.each(function(el) {
      el[L] = leftward;
      el.parent = parent;
      if (leftward) leftward[R] = el;

      leftward = el;
    });

    return self;
  };

  _.disown = function() {
    var self = this;
    var leftEnd = self.end[L];

    // guard for empty and already-disowned fragments
    if (!leftEnd || self.disowned) return self;

    self.disowned = true;

    var rightEnd = self.end[R]
    var parent = leftEnd.parent;

    prayWellFormed(parent, leftEnd[L], leftEnd);
    prayWellFormed(parent, rightEnd, rightEnd[R]);

    if (leftEnd[L]) {
      leftEnd[L][R] = rightEnd[R];
    } else {
      parent.endChild[L] = rightEnd[R];
    }

    if (rightEnd[R]) {
      rightEnd[R][L] = leftEnd[L];
    } else {
      parent.endChild[R] = leftEnd[L];
    }

    return self;
  };

  _.each = function(fn) {
    var self = this;
    var el = self.end[L];
    if (!el) return self;

    for (;el !== self.end[R][R]; el = el[R]) {
      if (fn.call(self, el) === false) break;
    }

    return self;
  };

  _.fold = function(fold, fn) {
    this.each(function(el) {
      fold = fn.call(this, fold, el);
    });

    return fold;
  };
});
