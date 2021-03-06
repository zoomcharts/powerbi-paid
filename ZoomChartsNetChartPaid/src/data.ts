module powerbi.extensibility.visual {
    export class Data {
        public static convert(visual:any, host: IVisualHost, target: HTMLElement, options: VisualUpdateOptions) {
            if (isDebugVisual) {
                console.log("Debug info: Chart data update called", options);
            }

            let root = {
                nodes: [],
                links: [],
                classes: [],
                format: null,
            };
 
            let dataView = options.dataViews[0];
            if (!dataView) {
                displayMessage(target, "Either the data loading is taking longer than usual or the data fields for the visual are not properly configured.", "Incorrect data", false);
                return root;
            }

            if (//needed to add this line, because sometimes it outputs error of not able to access categories of null
                dataView.categorical.categories === null || 
                typeof(dataView.categorical.categories) == "undefined"
            ) {
                displayMessage(target, "Please, select at least one category for node grouping", "Incorrect data", false);
                return root;
            }

            let categoryIndexes = Data.getCategoryIndexes(dataView);
            let nodeCategoriesLength = categoryIndexes.nodeColumnIndexes.length;
            if (nodeCategoriesLength < 1) {
                displayMessage(target, "Please, select at least one category for node grouping", "Incorrect data", false);
                return root;
            }

            if (typeof(dataView.categorical.values) == "undefined") {
                displayMessage(target, "Please, select measure to view the network", "Incorrect data", false);
                return root;
            }
            hideMessage(target);

            let dataViewCategories = [];
            for (let i = 0; i < nodeCategoriesLength; i++) {
                dataViewCategories.push(dataView.categorical.categories[categoryIndexes.nodeColumnIndexes[i]]);
            }

            let values = dataViewCategories[0].values.length;
            let props = mergePropertiesIntoNew(visual.customProperties, visual.defaultProperties);

            //Clear currentCateogires
            if (visual.currentCategories) {
                for (let k of Object.keys(visual.currentCategories)) {
                    visual.currentCategories[k] = false;
                }
            }

            let nodeMap = [];
            let linkMap = [];
            let colorMap = [
                "#01b8aa",
                "#fd7976",
                "#f6da5e",
                "#00b8cf",
                "#374649",
                "#b37fa8",
                "#fea57d",
                "#53a8c2",
                "#778183"
            ];

            let default_shape = Data.nodeShape(props.nodes);
 
            for (let y = 0; y < nodeCategoriesLength; y++) {
                let m = y + 1;
                let color = colorMap[y];
                if(props.nodes.colorMode == "fixed" && props.nodes.fillColor) {
                    color = props.nodes.fillColor.solid.color;
                }

                let co = null; //category object containing category specific properties & values
                let shape = default_shape;

                if (props["category" + m]) {
                    co = props["category" + m];
                }

                /*if (co){
                 * TODO apply proper shape using custom settings
                 * move other category dependent settings here from nodeStyle function
                }*/
                if (co && co.show === true) {
                    let customCategoryShape: string = Data.nodeShape(co);

                    if (customCategoryShape !== "") {
                        shape = customCategoryShape;
                    }
                }

                nodeMap[y] = {};
                let o:any = {
                    className: "category" + m, //y
                    nameLegend: dataViewCategories[y].source.displayName,
                    style: {
                        fillColor: color,
                        display: shape
                    }
                };

                //override based on category specific values:
                if(co && co.show == true) { //apply category specific values only if category is enabled
                    if(co.colorMode && co.colorMode == "fixed") {
                        if(co.fillColor && co.fillColor.solid.color) {
                            o.style.fillColor = co.fillColor.solid.color;
                        }
                    }
                }
                root.classes.push(o);

                //extra parameter is not a valid parameter for nodeClasses, but this is easier approach 
                //for category processing, so create new object based on 'o' without reference.
                let o2 = Object.create(o);
                o2.extra = {
                    props: co
                };
                visual.currentCategories[m] = o2;
            }

            let format = dataView.categorical.values[0].source.format;
            root.format = format;

            visual.categoryIndexes = categoryIndexes;
            let imageCategoryIndex = categoryIndexes.imageColumnIndex;
            let linkLabelCategoryIndex = categoryIndexes.linkLabelColumnIndex;
            let nodeColorCategoyIndex = categoryIndexes.nodeColorColumnIndex;
            let linkColorCategoryIndex = categoryIndexes.linkColorColumnIndex;
            for (let x = 0; x < values; x++) {
                let value;
                if (typeof(dataView.categorical.values) != "undefined") {
                    value = dataView.categorical.values[0].values[x];
                }
                for (let y = 0; y < nodeCategoriesLength; y++) {
                    let cat = dataViewCategories[y];
                    let v = cat.values[x]; // name of the "category item"
                    let nodeId = y + ":" + v;
                    let ci = y + 1;

                    if (typeof(value) != "number") {
                        value = 1; // count
                    }
                    let sid: any = host.createSelectionIdBuilder().withCategory(dataViewCategories[y], x).createSelectionId();
                    if (typeof(nodeMap[y][nodeId]) === "undefined") {
                        let nodeImage = (imageCategoryIndex !== null ? secureString(dataView.categorical.categories[imageCategoryIndex].values[x]) : null);
                        let nodeColor = (nodeColorCategoyIndex !== null ? secureString(dataView.categorical.categories[nodeColorCategoyIndex].values[x]) : null);
                        nodeMap[y][nodeId] = {
                            name: secureString(v),
                            id: x,
                            depth: y,
                            value: 0,
                            selectionIds: [],
                            rowData: [],
                            image: secureString(nodeImage),
                            nodeColor: secureString(nodeColor)
                        };
                        nodeMap[y][nodeId].rowData.push(Data.generateRowData(x, dataView, categoryIndexes));

                        let nodeObject = {id: nodeId, extra: nodeMap[y][nodeId], loaded: true, className: "category" + ci};
                        root.nodes.push(nodeObject);
                    }

                    nodeMap[y][nodeId].selectionIds.push(sid);
                    if (y > 0) {
                        let f = (y - 1) + ":" + dataViewCategories[y - 1].values[x];
                        let t = nodeId;
                        let lid = f + "-" + t;
                        if (linkMap.indexOf(lid) < 0) {
                            let linkColor = dataView.categorical.categories[linkColorCategoryIndex].values[x];
                            let linkExtra = {
                                linkLabel: null,
                                linkValue: 0,
                                linkColor: (linkColorCategoryIndex === null) ? "" : secureString(linkColor)
                            };

                            linkMap.push(lid);
                            let link = {
                                id: lid,
                                from: f,
                                to: t,
                                extra: linkExtra
                            };
                            root.links.push(link);
                        }
                        let lvalue: any;

                        if (linkLabelCategoryIndex != null) {
                            let linkLabel = dataView.categorical.categories[linkLabelCategoryIndex];
                            if (linkLabel) {
                                if(isNaN(parseFloat(linkLabel.values[x])) || !isFinite(linkLabel.values[x])) {
                                    displayMessage(target, "We detected that Link Label Field contains non-numeric values. Only numeric values are supported in this field.", "Link Label Field contains non-numeric values", false);
                                    return {
                                        nodes: [{"id": "error", "value":0, "loaded":false, "style":{"opacity":0}}],
                                        links: [],
                                        classes: [],
                                        format: null,
                                    };
                                }
                            }
                            lvalue = parseInt(linkLabel.values[x]);
                            root.links[linkMap.indexOf(lid)].extra.linkValue += lvalue;
                        }
                    }
                    if (y == nodeCategoriesLength - 1) {
                        // update the values for the "Branch"
                        for (let z = 0; z <= y; z++) {
                            nodeMap[z][z + ":" + dataViewCategories[z].values[x]].value += value;
                        }
                    }
                }
            }
            let min = 1.0e12;
            let max = -min;

			function compare(a, b) {
                min = Math.min(min, a.extra.value);
                min = Math.min(min, b.extra.value);
                max = Math.max(max, a.extra.value);
                max = Math.max(max, b.extra.value);
				return a.extra.value - b.extra.value;
			}
			root.nodes = root.nodes.sort(compare);

	        /*
             * Group nodes in "ranges"
             * */
            let mode = "ultra-dynamic";
            let base = 21;
            let max_gain = 300;
            
            if (mode == "group") {
                let steps = 6;
                let step = 50;
                let nodes_in_step = Math.round(root.nodes.length / steps);
                for (let x = 0; x < root.nodes.length; x++) {
                    let node = root.nodes[x];
                    let belonging_category = this.getNodeBelongingCategory(visual.currentCategories, node);
                    let radius = Math.floor(x / nodes_in_step) * step + base;
                    root.nodes[x].extra.radius = getLimitedRadius(radius, props, belonging_category.props);
                }
            } else if (mode == "dynamic") {
                let range = max - min;
                for (let x = 0; x < root.nodes.length; x++) {
                    let node = root.nodes[x];
                    let belonging_category = this.getNodeBelongingCategory(visual.currentCategories, node);
                    let radius = base + (root.nodes[x].extra.value - min) / max * max_gain;
                    root.nodes[x].extra.radius = getLimitedRadius(radius, props, belonging_category.props);
                }
            } else if (mode == "ultra-dynamic") {
                let nodesByCategories: any = {};
                let categoriesByIds: any = {};
                let minCache: any = {};
                let maxCache: any = {};
                let absoluteMin: any;
                let absoluteMax: any;
                for (let x = 0; x < root.nodes.length; x++) {
                    let node = root.nodes[x];
                    let belonging_category = this.getNodeBelongingCategory(visual.currentCategories, node);
                    let categoryId = belonging_category.category_id;
                    if (typeof(nodesByCategories[categoryId]) == "undefined") nodesByCategories[categoryId] = [];
                    nodesByCategories[categoryId].push(node);
                    categoriesByIds[categoryId] = categoryId;
                    if (typeof(absoluteMin) == "undefined") {
                        absoluteMin = node.extra.value;
                        absoluteMax = node.extra.value;
                    } else {
                        if (node.extra.value > absoluteMax) absoluteMax = node.extra.value;
                        if (node.extra.value < absoluteMin) absoluteMin = node.extra.value;
                    }
                    if (typeof(maxCache[categoryId]) == "undefined") {
                        maxCache[categoryId] = node.extra.value;
                        minCache[categoryId] = node.extra.value;
                    } else {
                        if (node.extra.value > maxCache[categoryId]) maxCache[categoryId] = node.extra.value;
                        if (node.extra.value < minCache[categoryId]) minCache[categoryId] = node.extra.value;
                    }
                }
                let absoluteRange = absoluteMax - absoluteMin;
                for (let x in nodesByCategories) {
                    if (!nodesByCategories.hasOwnProperty(x)) continue;
                    let nodes = nodesByCategories[x];
                    let range = maxCache[x] - minCache[x];

                    let minRadius = props.nodes.minRadius;
                    let maxRadius = props.nodes.maxRadius;

                    let category = categoriesByIds[x];

                    let relativeMinRadius: any;
                    let relativeMaxRadius: any;

                    if (category) {
                        if(category.minRadius) {
                            relativeMinRadius = category.minRadius;
                        }
                        if(category.maxRadius) {
                            relativeMaxRadius = category.maxRadius;
                        }
                    }

                    for (let y = 0; y < nodesByCategories[x].length; y++) {
                        let node = nodesByCategories[x][y];
                        let ratio = (absoluteRange != 0) ? ((node.extra.value - absoluteMin) / (absoluteRange)) : 1;
                        node.extra.absoluteRatio = ratio;
                        ratio = (range != 0) ? ((node.extra.value - minCache[x]) / (range)) : 1;
                        node.extra.relativeRatio = ratio;
                    }
                }
            }
            return root;
        }

        public static getNodeBelongingCategory(categories, node_data) {
            let className = node_data.className;

            for (let k of Object.keys(categories)) {
                let c = categories[k];
                if (c.className == className) {
                    return {
                        "category_id": c.className,
                        "category_name": c.nameLegend,
                        "props": c.extra.props
                    };
                }
            }
            //can't find belonging category of a node? That actually shouldn't happen.
            return null;
        }

        /*
         * Function will get correct indexes for categories.
         */
        public static getCategoryIndexes(dataView: DataView) {
            let columns: any = dataView && dataView.categorical && dataView.categorical.categories;
            let a: IChartCategoryIndexesObject = {
                nodeColumnIndexes: [],
                valueColumnIndex: null,
                imageColumnIndex: null,
                linkLabelColumnIndex: null,
                nodeColorColumnIndex: null,
                linkColorColumnIndex: null
            };
            for (let k of Object.keys(columns)) {
                let col = columns[k];
                if (col.source.roles.Nodes) {
                    a.nodeColumnIndexes.push(k);
                }
                if (col.source.roles.imageField) {
                    a.imageColumnIndex = k;
                }
                if (col.source.roles.nodeValue) {
                    a.valueColumnIndex = k;
                }
                if(col.source.roles.linkLabelField) {
                    a.linkLabelColumnIndex = k;
                }
                if(col.source.roles.nodeColorField) {
                    a.nodeColorColumnIndex = k;
                }
                if(col.source.roles.linkColorField) {
                    a.linkColorColumnIndex = k;
                }
            }
            return a;
        }

        /*
         * Function simulates table row data from categories data.
         */
        private static generateRowData(valueNumber: number, dataView: DataView, categoryIndexes: IChartCategoryIndexesObject) {
            let rows: any = dataView && dataView.categorical && dataView.categorical.categories;
            if (!rows) {
                return [];
            }

            let value: any;
            let row: Array<any> = [];
            for (let i in categoryIndexes) {
                if (categoryIndexes[i] === null) continue;
                if (Array.isArray(categoryIndexes[i]) && categoryIndexes[i].length > 0) {
                    for (let n = 0; n < categoryIndexes[i].length; n++) {
                        row.push(secureString(rows[categoryIndexes[i][n]].values[valueNumber]));
                    }
                } else {
                    row.push(secureString(rows[categoryIndexes[i]].values[valueNumber]));
                }
            }
            if (typeof(dataView.categorical.values) != "undefined") {
                value = dataView.categorical.values[0].values[valueNumber];
            }
            value = (typeof(value) != "number" && !isNaN(value) ? parseFloat(value) : 1);
            row.push(value);
            return row;
        }

        public static nodeShape(node: any): string {
            let nodeShape: string = "";

            if (node.nodeType && node.nodeType === "default") {
                nodeShape = node.shape;
            } else {
                nodeShape = node.nodeType;
            }
            return nodeShape;
        }
    }

}
