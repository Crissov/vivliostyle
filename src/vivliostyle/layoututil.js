/**
 * Copyright 2016 Trim-marks Inc.
 *
 * Vivliostyle.js is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Vivliostyle.js is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Vivliostyle.js.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @fileoverview Utilities related to layout.
 */
goog.provide("vivliostyle.layoututil");

goog.require("adapt.task");
goog.require("adapt.vtree");
goog.require("vivliostyle.break");

goog.scope(() => {
    /**
     * @typedef {{nodeContext: adapt.vtree.NodeContext, atUnforcedBreak: boolean, break: boolean}}
     */
    vivliostyle.layoututil.LayoutIteratorState;

    /**
     * @constructor
     */
    vivliostyle.layoututil.LayoutIteratorStrategy = function() {};
    /** @const */ const LayoutIteratorStrategy = vivliostyle.layoututil.LayoutIteratorStrategy;

    /**
     * @param {!adapt.vtree.NodeContext} initialNodeContext
     * @return {!vivliostyle.layoututil.LayoutIteratorState}
     */
    LayoutIteratorStrategy.prototype.initialState = initialNodeContext => ({
        nodeContext: initialNodeContext,
        atUnforcedBreak: false,
        break: false
    });

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.startNonDisplayableNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.afterNonDisplayableNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.startIgnoredTextNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.afterIgnoredTextNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.startNonElementNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.afterNonElementNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.startInlineElementNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.afterInlineElementNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.startNonInlineElementNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.afterNonInlineElementNode = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    LayoutIteratorStrategy.prototype.finish = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorStrategy} strategy
     * @param {!adapt.vtree.LayoutContext} layoutContext
     * @constructor
     */
    vivliostyle.layoututil.LayoutIterator = function(strategy, layoutContext) {
        /** @private @const */ this.strategy = strategy;
        /** @private @const */ this.layoutContext = layoutContext;
    };
    /** @const */ const LayoutIterator = vivliostyle.layoututil.LayoutIterator;

    /**
     * @param {!adapt.vtree.NodeContext} initialNodeContext
     * @return {!adapt.task.Result<adapt.vtree.NodeContext>}
     */
    LayoutIterator.prototype.iterate = function(initialNodeContext) {
        /** @const */ const strategy = this.strategy;
        /** @const */ const state = strategy.initialState(initialNodeContext);
        /** @const {!adapt.task.Frame<adapt.vtree.NodeContext>} */ const frame = adapt.task.newFrame("LayoutIterator");
        frame.loopWithFrame(loopFrame => {
            let r;
            while (state.nodeContext) {
                if (!state.nodeContext.viewNode) {
                    if (state.nodeContext.after) {
                        r = strategy.afterNonDisplayableNode(state);
                    } else {
                        r = strategy.startNonDisplayableNode(state);
                    }
                } else if (state.nodeContext.viewNode.nodeType !== 1) {
                    if (adapt.vtree.canIgnore(state.nodeContext.viewNode, state.nodeContext.whitespace)) {
                        if (state.nodeContext.after) {
                            r = strategy.afterIgnoredTextNode(state);
                        } else {
                            r = strategy.startIgnoredTextNode(state);
                        }
                    } else {
                        if (state.nodeContext.after) {
                            r = strategy.afterNonElementNode(state);
                        } else {
                            r = strategy.startNonElementNode(state);
                        }
                    }
                } else {
                    if (state.nodeContext.inline) {
                        if (state.nodeContext.after) {
                            r = strategy.afterInlineElementNode(state);
                        } else {
                            r = strategy.startInlineElementNode(state);
                        }
                    } else {
                        if (state.nodeContext.after) {
                            r = strategy.afterNonInlineElementNode(state);
                        } else {
                            r = strategy.startNonInlineElementNode(state);
                        }
                    }
                }
                const cont = (r && r.isPending()) ? r : adapt.task.newResult(true);
                const nextResult = cont.thenAsync(() => {
                    if (state.break) {
                        return adapt.task.newResult(null);
                    }
                    return this.layoutContext.nextInTree(state.nodeContext, state.atUnforcedBreak);
                });
                if (nextResult.isPending()) {
                    nextResult.then(nextNodeContext => {
                        if (state.break) {
                            loopFrame.breakLoop();
                        } else {
                            state.nodeContext = nextNodeContext;
                            loopFrame.continueLoop();
                        }
                    });
                    return;
                } else if (state.break) {
                    loopFrame.breakLoop();
                    return;
                } else {
                    state.nodeContext = nextResult.get();
                }
            }
            strategy.finish(state);
            loopFrame.breakLoop();
        }).then(() => {
            frame.finish(state.nodeContext);
        });
        return frame.result();
    };

    /**
     * @param {boolean} leadingEdge
     * @constructor
     * @extends {vivliostyle.layoututil.LayoutIteratorStrategy}
     */
    vivliostyle.layoututil.EdgeSkipper = function(leadingEdge) {
        /** @protected @const */ this.leadingEdge = leadingEdge;
    };
    /** @const */ const EdgeSkipper = vivliostyle.layoututil.EdgeSkipper;
    goog.inherits(EdgeSkipper, LayoutIteratorStrategy);

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    EdgeSkipper.prototype.startNonInlineBox = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    EdgeSkipper.prototype.endEmptyNonInlineBox = state => {};

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @return {undefined|adapt.task.Result<boolean>}
     */
    EdgeSkipper.prototype.endNonInlineBox = state => {};

    /**
     * @param {!adapt.vtree.NodeContext} initialNodeContext
     * @return {!vivliostyle.layoututil.LayoutIteratorState}
     */
    EdgeSkipper.prototype.initialState = function(initialNodeContext) {
        return {
            nodeContext: initialNodeContext,
            atUnforcedBreak: !!this.leadingEdge && initialNodeContext.after,
            break: false,
            leadingEdge: this.leadingEdge,
            breakAtTheEdge: null,
            onStartEdges: false,
            leadingEdgeContexts: [],
            lastAfterNodeContext: null
        };
    };

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @param {!adapt.layout.Column} column
     * @return {boolean} Returns true if a forced break occurs.
     */
    EdgeSkipper.prototype.processForcedBreak = (state, column) => {
        const needForcedBreak = !state.leadingEdge && vivliostyle.break.isForcedBreakValue(state.breakAtTheEdge);
        if (needForcedBreak) {
            const nodeContext = state.nodeContext = state.leadingEdgeContexts[0] || state.nodeContext;
            nodeContext.viewNode.parentNode.removeChild(nodeContext.viewNode);
            column.pageBreakType = state.breakAtTheEdge;
        }
        return needForcedBreak;
    };

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @param {!adapt.layout.Column} column
     * @return {boolean} Returns true if the node overflows the column.
     */
    EdgeSkipper.prototype.saveEdgeAndProcessOverflow = (state, column) => {
        const overflow = column.checkOverflowAndSaveEdgeAndBreakPosition(state.lastAfterNodeContext, null, true, state.breakAtTheEdge);
        if (overflow) {
            state.nodeContext = (state.lastAfterNodeContext || state.nodeContext).modify();
            state.nodeContext.overflow = true;
        }
        return overflow;
    };

    /**
     * @param {!vivliostyle.layoututil.LayoutIteratorState} state
     * @param {!adapt.layout.LayoutConstraint} layoutConstraint
     * @param {!adapt.layout.Column} column
     * @returns {boolean} Returns true if the layout constraint is violated.
     */
    EdgeSkipper.prototype.processLayoutConstraint = (state, layoutConstraint, column) => {
        let nodeContext = state.nodeContext;
        const violateConstraint = !layoutConstraint.allowLayout(nodeContext);
        if (violateConstraint) {
            column.checkOverflowAndSaveEdgeAndBreakPosition(state.lastAfterNodeContext, null, false, state.breakAtTheEdge);
            nodeContext = state.nodeContext = nodeContext.modify();
            nodeContext.overflow = true;
        }
        return violateConstraint;
    };

    /**
     * @override
     */
    EdgeSkipper.prototype.startNonElementNode = state => {
        state.onStartEdges = false;
    };

    /**
     * @override
     */
    EdgeSkipper.prototype.startNonInlineElementNode = function(state) {
        state.leadingEdgeContexts.push(state.nodeContext.copy());
        state.breakAtTheEdge = vivliostyle.break.resolveEffectiveBreakValue(state.breakAtTheEdge, state.nodeContext.breakBefore);
        state.onStartEdges = true;
        return this.startNonInlineBox(state);
    };

    /**
     * @override
     */
    EdgeSkipper.prototype.afterNonInlineElementNode = function(state) {
        let r;
        let cont;
        if (state.onStartEdges) {
            r = this.endEmptyNonInlineBox(state);
            cont = (r && r.isPending()) ? r : adapt.task.newResult(true);
            cont = cont.thenAsync(() => {
                if (!state.break) {
                    state.leadingEdgeContexts = [];
                    state.leadingEdge = false;
                    state.atUnforcedBreak = false;
                    state.breakAtTheEdge = null;
                }
                return adapt.task.newResult(true);
            });
        } else {
            r = this.endNonInlineBox(state);
            cont = (r && r.isPending()) ? r : adapt.task.newResult(true);
        }
        return cont.thenAsync(() => {
            if (!state.break) {
                state.onStartEdges = false;
                state.lastAfterNodeContext = state.nodeContext.copy();
                state.breakAtTheEdge = vivliostyle.break.resolveEffectiveBreakValue(state.breakAtTheEdge, state.nodeContext.breakAfter);
            }
            return adapt.task.newResult(true);
        });
    };

    /**
     * Represents a "pseudo"-column nested inside a real column.
     * This class is created to handle parallel fragmented flows (e.g. table columns in a single table row).
     * A pseudo-column behaves in the same way as the original column, sharing its properties.
     * Property changes on the pseudo-column are not propagated to the original column.
     * The LayoutContext of the original column is also cloned and used by the pseudo-column,
     * not to propagate state changes of the LayoutContext caused by the pseudo-column.
     * @param {!adapt.layout.Column} column The original (parent) column
     * @param {Element} viewRoot Root element for the pseudo-column, i.e., the root of the fragmented flow.
     * @param {!adapt.vtree.NodeContext} parentNodeContext A NodeContext generating this PseudoColumn
     * @constructor
     */
    vivliostyle.layoututil.PseudoColumn = function(column, viewRoot, parentNodeContext) {
        /** @const {!Array<!adapt.vtree.NodeContext>} */ this.startNodeContexts = [];
        /** @private @const */ this.column = /** @type {!adapt.layout.Column} */ (Object.create(column));
        this.column.element = viewRoot;
        this.column.layoutContext = column.layoutContext.clone();
        this.column.stopAtOverflow = false;
        this.column.flowRootFormattingContext = parentNodeContext.formattingContext;
        this.column.pseudoParent = column;

        const parentClonedPaddingBorder = this.column.calculateClonedPaddingBorder(parentNodeContext);
        this.column.footnoteEdge = this.column.footnoteEdge - parentClonedPaddingBorder;

        const pseudoColumn = this;
        this.column.openAllViews = function(position) {
            return adapt.layout.Column.prototype.openAllViews.call(this, position).thenAsync(result => {
                pseudoColumn.startNodeContexts.push(result.copy());
                return adapt.task.newResult(result);
            });
        };
    };
    /** @const */ const PseudoColumn = vivliostyle.layoututil.PseudoColumn;

    /**
     * @param {adapt.vtree.ChunkPosition} chunkPosition starting position.
     * @param {boolean} leadingEdge
     * @return {!adapt.task.Result.<adapt.vtree.ChunkPosition>} holding end position.
     */
    PseudoColumn.prototype.layout = function(chunkPosition, leadingEdge) {
        return this.column.layout(chunkPosition, leadingEdge);
    };

    /**
     * @param {boolean} allowBreakAtStartPosition
     * @returns {!adapt.layout.BreakPositionAndNodeContext}
     */
    PseudoColumn.prototype.findAcceptableBreakPosition = function(allowBreakAtStartPosition) {
        const p = this.column.findAcceptableBreakPosition();
        if (allowBreakAtStartPosition) {
            const startNodeContext = this.startNodeContexts[0].copy();
            const bp = new adapt.layout.EdgeBreakPosition(startNodeContext, null,
                startNodeContext.overflow, 0);
            bp.findAcceptableBreak(this.column, 0);
            if (!p.nodeContext) {
                return {
                    breakPosition: bp,
                    nodeContext: startNodeContext
                };
            }
        }
        return p;
    };

    /**
     * @param {adapt.vtree.NodeContext} nodeContext
     * @param {boolean} forceRemoveSelf
     * @param {boolean} endOfColumn
     * @return {!adapt.task.Result.<boolean>} holing true
     */
    PseudoColumn.prototype.finishBreak = function(nodeContext, forceRemoveSelf, endOfColumn) {
        return this.column.finishBreak(nodeContext, forceRemoveSelf, endOfColumn);
    };

    /**
     * @param {adapt.vtree.NodeContext} positionAfter
     */
    PseudoColumn.prototype.doFinishBreakOfFragmentLayoutConstraints = function(positionAfter) {
        this.column.doFinishBreakOfFragmentLayoutConstraints(positionAfter);
    };

    /**
     * @param {adapt.vtree.NodeContext} nodeContext
     * @return {boolean}
     */
    PseudoColumn.prototype.isStartNodeContext = function(nodeContext) {
        const startNodeContext = this.startNodeContexts[0];
        return startNodeContext.viewNode === nodeContext.viewNode
            && startNodeContext.after === nodeContext.after
            && startNodeContext.offsetInNode === nodeContext.offsetInNode;
    };

    /**
     * @param {adapt.vtree.NodeContext} nodeContext
     * @return {boolean}
     */
    PseudoColumn.prototype.isLastAfterNodeContext = function(nodeContext) {
        return adapt.vtree.isSameNodePosition(nodeContext.toNodePosition(), this.column.lastAfterPosition);
    };

    /**
     * @return {Element}
     */
    PseudoColumn.prototype.getColumnElement = function() {
        return this.column.element;
    };

    /**
     * @return {!adapt.layout.Column}
     */
    PseudoColumn.prototype.getColumn = function() {
        return this.column;
    };


    /**
     * @abstract
     * @constructor
     */
    vivliostyle.layoututil.AbstractLayoutRetryer = function() {
        /** @type {Array.<adapt.layout.BreakPosition>} */this.initialBreakPositions = null;
        /** @type {*} */ this.initialStateOfFormattingContext = null;
    };
    /** @const */ const AbstractLayoutRetryer = vivliostyle.layoututil.AbstractLayoutRetryer;

    /**
     * @param {!adapt.vtree.NodeContext} nodeContext
     * @param {!adapt.layout.Column} column
     * @returns {!adapt.task.Result.<adapt.vtree.NodeContext>}
     */
    AbstractLayoutRetryer.prototype.layout = function(nodeContext, column) {
        this.prepareLayout(nodeContext, column);
        return this.tryLayout(nodeContext, column);
    };
    /**
     * @private
     * @param {!adapt.vtree.NodeContext} nodeContext
     * @param {!adapt.layout.Column} column
     * @returns {!adapt.task.Result.<adapt.vtree.NodeContext>}
     */
    AbstractLayoutRetryer.prototype.tryLayout = function(nodeContext, column) {
        const frame = adapt.task.newFrame("vivliostyle.layoututil.AbstractLayoutRetryer.tryLayout");

        this.saveState(nodeContext, column);

        const mode = this.resolveLayoutMode(nodeContext);
        mode.doLayout(nodeContext, column).then(function(positionAfter) {
            let accepted = mode.accept(positionAfter, column);
            accepted = mode.postLayout(positionAfter, this.initialPosition, column, accepted);
            if (accepted) {
                frame.finish(positionAfter);
            } else {
                goog.asserts.assert(this.initialPosition);
                this.clearNodes(this.initialPosition);
                this.restoreState(nodeContext, column);
                this.tryLayout(this.initialPosition, column).thenFinish(frame);
            }
        }.bind(this));
        return frame.result();
    };

    /**
     * @abstract
     * @param {!adapt.vtree.NodeContext} nodeContext
     * @return {vivliostyle.layoututil.LayoutMode}
     */
    AbstractLayoutRetryer.prototype.resolveLayoutMode = nodeContext => {};

    /**
     * @param {!adapt.vtree.NodeContext} nodeContext
     * @param {!adapt.layout.Column} column
     */
    AbstractLayoutRetryer.prototype.prepareLayout = (nodeContext, column) => {};

    /**
     * @param {!adapt.vtree.NodeContext} initialPosition
     */
    AbstractLayoutRetryer.prototype.clearNodes = initialPosition => {
        const viewNode = initialPosition.viewNode || initialPosition.parent.viewNode;
        let child;
        while (child = viewNode.lastChild) {
            viewNode.removeChild(child);
        }
        let sibling;
        while (sibling = viewNode.nextSibling) {
            sibling.parentNode.removeChild(sibling);
        }
    };

    /**
     * @param {!adapt.vtree.NodeContext} nodeContext
     * @param {!adapt.layout.Column} column
     */
    AbstractLayoutRetryer.prototype.saveState = function(nodeContext, column) {
        this.initialPosition = nodeContext.copy();
        this.initialBreakPositions = [].concat(column.breakPositions);
        this.initialFragmentLayoutConstraints =
            [].concat(column.fragmentLayoutConstraints);
        if (nodeContext.formattingContext) {
            this.initialStateOfFormattingContext =
                nodeContext.formattingContext.saveState();
        }
    };

    /**
     * @param {!adapt.vtree.NodeContext} nodeContext
     * @param {!adapt.layout.Column} column
     */
    AbstractLayoutRetryer.prototype.restoreState = function(nodeContext, column) {
        column.breakPositions = this.initialBreakPositions;
        column.fragmentLayoutConstraints = this.initialFragmentLayoutConstraints;
        if (nodeContext.formattingContext) {
            nodeContext.formattingContext.restoreState(
                this.initialStateOfFormattingContext);
        }
    };


    /**
     * @interface
     */
    vivliostyle.layoututil.LayoutMode = function() {};
    /** @const */ const LayoutMode = vivliostyle.layoututil.LayoutMode;

    /**
     * @param {!adapt.vtree.NodeContext} nodeContext
     * @param {!adapt.layout.Column} column
     * @returns {!adapt.task.Result.<adapt.vtree.NodeContext>}
     */
    LayoutMode.prototype.doLayout = (nodeContext, column) => {};

    /**
     * @param {!adapt.vtree.NodeContext} nodeContext
     * @param {!adapt.layout.Column} column
     * @return {boolean}
     */
    LayoutMode.prototype.accept = (nodeContext, column) => {};

    /**
     * @param {!adapt.vtree.NodeContext} positionAfter
     * @param {!adapt.vtree.NodeContext} initialPosition
     * @param {!adapt.layout.Column} column
     * @param {boolean} accepted
     * @returns {boolean}
     */
    LayoutMode.prototype.postLayout = (positionAfter, initialPosition, column, accepted) => {};


});
