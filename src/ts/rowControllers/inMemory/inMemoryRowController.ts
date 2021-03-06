import {Utils as _} from '../../utils';
import {Constants as constants} from '../../constants';
import {GridOptionsWrapper} from "../../gridOptionsWrapper";
import {ColumnController} from "../../columnController/columnController";
import {Grid} from "../../grid";
import {FilterManager} from "../../filter/filterManager";
import {RowNode} from "../../entities/rowNode";
import {ValueService} from "../../valueService";
import {EventService} from "../../eventService";
import {Events} from "../../events";
import {Column} from "../../entities/column";
import {ColDef} from "../../entities/colDef";
import {Bean} from "../../context/context";
import {Qualifier} from "../../context/context";
import {GridCore} from "../../gridCore";
import {SelectionController} from "../../selectionController";
import {Autowired} from "../../context/context";
import {IRowModel} from "./../../interfaces/iRowModel";
import {Constants} from "../../constants";
import {SortController} from "../../sortController";
import {PostConstruct} from "../../context/context";
import {NodeChildDetails} from "../../entities/gridOptions";
import {IRowNodeStage} from "../../interfaces/iRowNodeStage";
import {Optional} from "../../context/context";

enum RecursionType {Normal, AfterFilter, AfterFilterAndSort};

@Bean('rowModel')
export class InMemoryRowController implements IRowModel {

    @Autowired('gridOptionsWrapper') private gridOptionsWrapper: GridOptionsWrapper;
    @Autowired('columnController') private columnController: ColumnController;
    @Autowired('filterManager') private filterManager: FilterManager;
    @Autowired('$scope') private $scope: any;
    @Autowired('selectionController') private selectionController: SelectionController;
    @Autowired('eventService') private eventService: EventService;

    // standard stages
    @Autowired('filterStage') private filterStage: IRowNodeStage;
    @Autowired('sortStage') private sortStage: IRowNodeStage;
    @Autowired('flattenStage') private flattenStage: IRowNodeStage;

    // enterprise stages
    @Optional('groupStage') private groupStage: IRowNodeStage;
    @Optional('aggregationStage') private aggregationStage: IRowNodeStage;

    // the rows go through a pipeline of steps, each array below is the result
    // after a certain step.
    private allRows: RowNode[] = []; // the rows, in a list, as provided by the user, but wrapped in RowNode objects
    private rowsAfterGroup: RowNode[]; // rows in group form, stored in a tree (the parent / child bits of RowNode are used)
    private rowsAfterFilter: RowNode[]; // after filtering
    private rowsAfterSort: RowNode[]; // after sorting
    private rowsToDisplay: RowNode[]; // the rows mapped to rows to display

    @PostConstruct
    public init(): void {

        this.eventService.addModalPriorityEventListener(Events.EVENT_COLUMN_EVERYTHING_CHANGED, this.refreshModel.bind(this, Constants.STEP_EVERYTHING));
        this.eventService.addModalPriorityEventListener(Events.EVENT_COLUMN_ROW_GROUP_CHANGE, this.refreshModel.bind(this, Constants.STEP_EVERYTHING));
        this.eventService.addModalPriorityEventListener(Events.EVENT_COLUMN_VALUE_CHANGE, this.refreshModel.bind(this, Constants.STEP_AGGREGATE));

        this.eventService.addModalPriorityEventListener(Events.EVENT_FILTER_CHANGED, this.refreshModel.bind(this, constants.STEP_FILTER));
        this.eventService.addModalPriorityEventListener(Events.EVENT_SORT_CHANGED, this.refreshModel.bind(this, constants.STEP_SORT));

        if (this.gridOptionsWrapper.isRowModelDefault()) {
            this.setRowData(this.gridOptionsWrapper.getRowData(), this.columnController.isReady());
        }

    }

    public refreshModel(step: number, fromIndex?: any): void {

        // this goes through the pipeline of stages. what's in my head is similar
        // to the diagram on this page:
        // http://commons.apache.org/sandbox/commons-pipeline/pipeline_basics.html
        // however we want to keep the results of each stage, hence we manually call
        // each step rather than have them chain each other.

        // fallthrough in below switch is on purpose,
        // eg if STEP_FILTER, then all steps below this
        // step get done
        switch (step) {
            case constants.STEP_EVERYTHING:
                this.doRowGrouping();
            case constants.STEP_FILTER:
                this.doFilter();
            case constants.STEP_AGGREGATE:
                this.doAggregate();
            case constants.STEP_SORT:
                this.doSort();
            case constants.STEP_MAP:
                this.doRowsToDisplay();
        }

        this.eventService.dispatchEvent(Events.EVENT_MODEL_UPDATED, {fromIndex: fromIndex});

        if (this.$scope) {
            setTimeout( () => {
                this.$scope.$apply();
            }, 0);
        }
    }

    public isEmpty(): boolean {
        return this.allRows === null || this.allRows.length === 0 || !this.columnController.isReady();
    }

    public isRowsToRender(): boolean {
        return _.exists(this.rowsToDisplay) && this.rowsToDisplay.length > 0;
    }

    public setDatasource(datasource: any): void {
        console.error('ag-Grid: should never call setDatasource on inMemoryRowController');
    }

    public getTopLevelNodes() {
        return this.rowsAfterGroup;
    }

    public getRow(index: number): RowNode {
        return this.rowsToDisplay[index];
    }

    public getRowCount(): number {
        if (this.rowsToDisplay) {
            return this.rowsToDisplay.length;
        } else {
            return 0;
        }
    }

    public getRowAtPixel(pixelToMatch: number): number {
        if (this.isEmpty()) {
            return -1;
        }

        // do binary search of tree
        // http://oli.me.uk/2013/06/08/searching-javascript-arrays-with-a-binary-search/
        var bottomPointer = 0;
        var topPointer = this.rowsToDisplay.length - 1;

        // quick check, if the pixel is out of bounds, then return last row
        if (pixelToMatch<=0) {
            // if pixel is less than or equal zero, it's always the first row
            return 0;
        }
        var lastNode = this.rowsToDisplay[this.rowsToDisplay.length-1];
        if (lastNode.rowTop<=pixelToMatch) {
            return this.rowsToDisplay.length - 1;
        }

        while (true) {

            var midPointer = Math.floor((bottomPointer + topPointer) / 2);
            var currentRowNode = this.rowsToDisplay[midPointer];

            if (this.isRowInPixel(currentRowNode, pixelToMatch)) {
                return midPointer;
            } else if (currentRowNode.rowTop < pixelToMatch) {
                bottomPointer = midPointer + 1;
            } else if (currentRowNode.rowTop > pixelToMatch) {
                topPointer = midPointer - 1;
            }

        }
    }

    private isRowInPixel(rowNode: RowNode, pixelToMatch: number): boolean {
        var topPixel = rowNode.rowTop;
        var bottomPixel = rowNode.rowTop + rowNode.rowHeight;
        var pixelInRow = topPixel <= pixelToMatch && bottomPixel > pixelToMatch;
        return pixelInRow;
    }

    public getRowCombinedHeight(): number {
        if (this.rowsToDisplay && this.rowsToDisplay.length > 0) {
            var lastRow = this.rowsToDisplay[this.rowsToDisplay.length - 1];
            var lastPixel = lastRow.rowTop + lastRow.rowHeight;
            return lastPixel;
        } else {
            return 0;
        }
    }

    public forEachNode(callback: Function) {
        this.recursivelyWalkNodesAndCallback(this.rowsAfterGroup, callback, RecursionType.Normal, 0);
    }

    public forEachNodeAfterFilter(callback: Function) {
        this.recursivelyWalkNodesAndCallback(this.rowsAfterFilter, callback, RecursionType.AfterFilter, 0);
    }

    public forEachNodeAfterFilterAndSort(callback: Function) {
        this.recursivelyWalkNodesAndCallback(this.rowsAfterSort, callback, RecursionType.AfterFilterAndSort, 0);
    }

    // iterates through each item in memory, and calls the callback function
    // nodes - the rowNodes to traverse
    // callback - the user provided callback
    // recursion type - need this to know what child nodes to recurse, eg if looking at all nodes, or filtered notes etc
    // index - works similar to the index in forEach in javascripts array function
    private recursivelyWalkNodesAndCallback(nodes: RowNode[], callback: Function, recursionType: RecursionType, index: number) {
        if (nodes) {
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                callback(node, index++);
                // go to the next level if it is a group
                if (node.group) {
                    // depending on the recursion type, we pick a difference set of children
                    var nodeChildren: RowNode[];
                    switch (recursionType) {
                        case RecursionType.Normal : nodeChildren = node.children; break;
                        case RecursionType.AfterFilter : nodeChildren = node.childrenAfterFilter; break;
                        case RecursionType.AfterFilterAndSort : nodeChildren = node.childrenAfterSort; break;
                    }
                    if (nodeChildren) {
                        index = this.recursivelyWalkNodesAndCallback(nodeChildren, callback, recursionType, index);
                    }
                }
            }
        }
        return index;
    }


    // it's possible to recompute the aggregate without doing the other parts
    // + gridApi.recomputeAggregates()
    public doAggregate() {
        if (this.aggregationStage) {
            this.aggregationStage.execute(this.rowsAfterFilter);
        }
    }

    // + gridApi.expandAll()
    // + gridApi.collapseAll()
    public expandOrCollapseAll(expand: boolean): void {

        recursiveExpandOrCollapse(this.rowsAfterGroup);

        function recursiveExpandOrCollapse(rowNodes: RowNode[]): void {
            if (!rowNodes) { return; }
            rowNodes.forEach( (rowNode: RowNode) => {
                if (rowNode.group) {
                    rowNode.expanded = expand;
                    recursiveExpandOrCollapse(rowNode.children);
                }
            });
        }

        this.refreshModel(Constants.STEP_MAP);
    }

    private doSort() {
        this.rowsAfterSort = this.sortStage.execute(this.rowsAfterFilter);
    }

    private doRowGrouping() {
        // grouping is enterprise only, so if service missing, skip the step
        var rowsAlreadyGrouped = _.exists(this.gridOptionsWrapper.getNodeChildDetailsFunc());

        if (this.groupStage && !rowsAlreadyGrouped) {

            // remove old groups from the selection model, as we are about to replace them
            // with new groups
            this.selectionController.removeGroupsFromSelection();

            this.rowsAfterGroup = this.groupStage.execute(this.allRows);

            if (this.gridOptionsWrapper.isGroupSelectsChildren()) {
                this.selectionController.updateGroupsFromChildrenSelections();
            }
        } else {
            this.rowsAfterGroup = this.allRows;
        }
    }

    private doFilter() {
        this.rowsAfterFilter = this.filterStage.execute(this.rowsAfterGroup);
    }

    // rows: the rows to put into the model
    // firstId: the first id to use, used for paging, where we are not on the first page
    public setRowData(rowData: any[], refresh: boolean, firstId?: number) {

        // place each row into a wrapper
        this.allRows = this.createRowNodesFromData(rowData, firstId);

        this.eventService.dispatchEvent(Events.EVENT_ROW_DATA_CHANGED);

        if (refresh) {
            this.refreshModel(Constants.STEP_EVERYTHING);
        }
    }

    private createRowNodesFromData(rowData: any[], firstId?: number): RowNode[] {
        if (!rowData) {
            return [];
        }

        var rowNodeId = _.exists(firstId) ? firstId : 0;

        // func below doesn't have 'this' pointer, so need to pull out these bits
        var nodeChildDetailsFunc = this.gridOptionsWrapper.getNodeChildDetailsFunc();
        var suppressParentsInRowNodes = this.gridOptionsWrapper.isSuppressParentsInRowNodes();
        var eventService = this.eventService;
        var gridOptionsWrapper = this.gridOptionsWrapper;
        var selectionController = this.selectionController;

        // kick off recursion
        var result = recursiveFunction(rowData, null, 0);
        return result;

        function recursiveFunction(rowData: any[], parent: RowNode, level: number): RowNode[] {
            var rowNodes: RowNode[] = [];
            rowData.forEach( (dataItem)=> {
                var node = new RowNode(eventService, gridOptionsWrapper, selectionController);
                var nodeChildDetails = nodeChildDetailsFunc ? nodeChildDetailsFunc(dataItem) : null;
                if (nodeChildDetails && nodeChildDetails.group) {
                    node.group = true;
                    node.children = recursiveFunction(nodeChildDetails.children, node, level + 1);
                    node.expanded = nodeChildDetails.expanded === true;
                    node.field = nodeChildDetails.field;
                    node.key = nodeChildDetails.key;
                }

                if (parent && !suppressParentsInRowNodes) {
                    node.parent = parent;
                }
                node.level = level;
                node.id = rowNodeId++;
                node.data = dataItem;

                rowNodes.push(node);
            });
            return rowNodes;
        }

    }

    private doRowsToDisplay() {
        this.rowsToDisplay = this.flattenStage.execute(this.rowsAfterSort);
    }
}
