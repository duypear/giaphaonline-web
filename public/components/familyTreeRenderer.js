// public/components/familyTreeRenderer.js
/**
 * ====================================================================
 * HỆ THỐNG VẼ CÂY GIA PHẢ - PHIÊN BẢN PHOTO CHART (IMPROVED LOGIC)
 * - Layout: Recursive Tree (Cây phân cấp tự động căn chỉnh)
 * - Connection: Fork Style (Đường vuông góc)
 * - Fix: Unrelated People được tách riêng thành Grid nằm dưới đáy.
 * - Zoom & Pan: Tích hợp bằng cuộn chuột và kéo thả.
 * - NEW: Lọc cây theo người được chọn (chỉ hiển thị người liên quan)
 * ====================================================================
 */

console.log('FamilyTreeRenderer (Improved Logic Version) loading...');
class FamilyTreeRenderer {
    constructor(svgElementId) {
        this.svg = document.getElementById(svgElementId);
        if (!this.svg) {
            console.error(`Không tìm thấy SVG element với id: ${svgElementId}`);
            return;
        }

        this.targetPersonId = 1; // mặc định
        // Cấu hình Kích thước & Màu sắc
        this.config = {
            cardWidth: 160,
            cardHeight: 200,
            avatarSize: 80,
            
            gapX: 40,
            gapY: 100,
            spouseGap: 10,

            padding: 80,

            gridCols: 6,
            gridGapX: 20,
            gridGapY: 20,

            colors: {
                maleBorder: '#0ea5e9',
                maleBg: '#e0f2fe',
                femaleBorder: '#ec4899',
                femaleBg: '#fce7f3',
                deadBg: '#1f2937',
                deadText: '#f3f4f6',
                line: '#06b6d4',
                textName: '#111827',
                textInfo: '#4b5563'
            }
        };

        this.scale = 1;

        // Dữ liệu GỐC (toàn bộ database)
        this.allPeople = [];
        this.allRelationships = [];
        this.allMarriages = [];
        
        // Dữ liệu ĐÃ LỌC (chỉ người liên quan)
        this.people = [];
        this.relationships = [];
        this.marriages = [];
        
        // Maps hỗ trợ truy xuất nhanh
        this.peopleMap = new Map();
        this.spouseMap = new Map();
        this.childrenMap = new Map();

        this.unrelatedPeople = [];
        this.nodesToRender = [];
        
        // ID người được chọn để hiển thị cây
        this.selectedPersonId = null;
        
        // View state cho zoom/pan
        this.view = {
            panning: false,
            pointX: 0,
            pointY: 0,
            startX: 0,
            startY: 0,
            originX: 0,
            originY: 0,
            startClientX: 0,
            startClientY: 0,
            moved: false,
            suppressClick: false
        };
        
        this.setupPanZoom();
    }
    setTargetPerson(id) {
    this.targetPersonId = id;
    this.processData();
    this.render();
}
    /**
     * Load dữ liệu từ API
     * @param {number|null} personId - ID người cần hiển thị cây (null = mặc định id=1)
     */
    async loadData(personId = null) {
        try {
            const token = localStorage.getItem('authToken');
            
            const response = await fetch('/api/dashboard/family-tree', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.message);

            // Lưu dữ liệu GỐC
            this.allPeople = result.data.people || [];
            this.allRelationships = result.data.relationships || [];
            this.allMarriages = result.data.marriages || [];
            
            // Xác định người được chọn
        // ✅ XÁC ĐỊNH THỦY TỔ (người có generation = 1)
if (!personId) {
    // Tìm người có generation = 1 (Thủy tổ)
    const thuyTo = this.allPeople.find(p => p.generation === 1);
    this.selectedPersonId = thuyTo ? thuyTo.id : (this.allPeople[0]?.id || 1);
    console.log(`🎯 Tìm thấy Thủy tổ: ID ${this.selectedPersonId}`);
} else {
    this.selectedPersonId = personId;
}
            
            // Lọc dữ liệu theo người được chọn
            this.filterDataByPerson(this.selectedPersonId);
            
            return true;
        } catch (error) {
            this.showError('Lỗi tải dữ liệu: ' + error.message);
            return false;
        }
    }

    /**
     * Lọc dữ liệu để chỉ giữ lại những người liên quan đến personId
     * Bao gồm: Tổ tiên, con cháu, anh chị em, vợ/chồng
     */
    filterDataByPerson(personId) {
        const relatedIds = new Set();
        
        // Kiểm tra người được chọn có tồn tại không
      const selectedPerson = this.allPeople.find(p => p.id === personId);
if (!selectedPerson) {
    console.warn(`⚠️ Không tìm thấy người có id=${personId}`);
    
    // ✅ TÌM THỦY TỔ (generation = 1) LÀM MẶC ĐỊNH
    const thuyTo = this.allPeople.find(p => p.generation === 1);
    
    if (thuyTo) {
        console.log(`🎯 Hiển thị cây từ Thủy tổ: ${thuyTo.full_name} (ID ${thuyTo.id})`);
        this.selectedPersonId = thuyTo.id;
        this.filterDataByPerson(thuyTo.id);
        return;
    } else {
        // Không có Thủy tổ → Hiển thị toàn bộ
        console.warn('⚠️ Không tìm thấy Thủy tổ, hiển thị toàn bộ dữ liệu');
        this.people = this.allPeople;
        this.relationships = this.allRelationships;
        this.marriages = this.allMarriages;
        this.processData();
        return;
    }
}
        
        // 1. Thêm chính người được chọn
        relatedIds.add(personId);
        
        // 2. Tìm TỔ TIÊN (đi ngược lên trên)
        this.findAncestors(personId, relatedIds);
        
        // 3. Tìm CON CHÁU (đi xuống dưới)
        this.findDescendants(personId, relatedIds);
        
        // 4. Tìm ANH CHỊ EM (con chung của cùng cha mẹ)
        this.findSiblings(personId, relatedIds);
        
        // 5. Tìm VỢ/CHỒNG của TẤT CẢ người liên quan
        this.findSpouses(relatedIds);
        
        // 6. Lọc dữ liệu
        this.people = this.allPeople.filter(p => relatedIds.has(p.id));
        this.relationships = this.allRelationships.filter(r => 
            relatedIds.has(r.parent_id) && relatedIds.has(r.child_id)
        );
        this.marriages = this.allMarriages.filter(m =>
            (m.husband_id && relatedIds.has(m.husband_id)) ||
            (m.wife_id && relatedIds.has(m.wife_id))
        );
        
        console.log(`Filtered: ${this.people.length}/${this.allPeople.length} người liên quan đến ID ${personId}`);
        
        // Xử lý dữ liệu đã lọc
        this.processData();
    }

    /**
     * Tìm tất cả TỔ TIÊN (cha mẹ, ông bà, cố, kỵ,...)
     */
    findAncestors(personId, relatedIds) {
        const parents = this.allRelationships
            .filter(r => r.child_id === personId)
            .map(r => r.parent_id);
        
        parents.forEach(parentId => {
            if (!relatedIds.has(parentId)) {
                relatedIds.add(parentId);
                // Đệ quy tìm tổ tiên của cha mẹ
                this.findAncestors(parentId, relatedIds);
            }
        });
    }

    /**
     * Tìm tất cả CON CHÁU (con, cháu, chắt,...)
     */
    findDescendants(personId, relatedIds) {
        const children = this.allRelationships
            .filter(r => r.parent_id === personId)
            .map(r => r.child_id);
        
        children.forEach(childId => {
            if (!relatedIds.has(childId)) {
                relatedIds.add(childId);
                // Đệ quy tìm con cháu của con
                this.findDescendants(childId, relatedIds);
            }
        });
    }

    /**
     * Tìm ANH CHỊ EM (những người cùng cha hoặc cùng mẹ)
     */
    findSiblings(personId, relatedIds) {
        // Tìm cha mẹ của người này
        const parents = this.allRelationships
            .filter(r => r.child_id === personId)
            .map(r => r.parent_id);
        
        // Tìm tất cả con của các cha mẹ này (= anh chị em)
        parents.forEach(parentId => {
            const siblings = this.allRelationships
                .filter(r => r.parent_id === parentId)
                .map(r => r.child_id);
            
            siblings.forEach(siblingId => {
                if (!relatedIds.has(siblingId)) {
                    relatedIds.add(siblingId);
                    // Đệ quy tìm con cháu của anh chị em
                    this.findDescendants(siblingId, relatedIds);
                }
            });
        });
    }

    /**
     * Tìm VỢ/CHỒNG của tất cả người trong danh sách
     */
    findSpouses(relatedIds) {
        const spousesToAdd = new Set();
        
        this.allMarriages.forEach(m => {
            if (m.husband_id && relatedIds.has(m.husband_id) && m.wife_id) {
                spousesToAdd.add(m.wife_id);
            }
            if (m.wife_id && relatedIds.has(m.wife_id) && m.husband_id) {
                spousesToAdd.add(m.husband_id);
            }
        });
        
        spousesToAdd.forEach(id => relatedIds.add(id));
    }

 processData() {
    // Map ID -> Person (toàn bộ DB)
    this.peopleMap.clear();
    const fullPeopleMap = new Map();
    this.people.forEach(p => {
        fullPeopleMap.set(p.id, p);
    });

    // Xây adjacency chỉ cho CHA–CON (bloodline)
    const parentChild = new Map();
    const addPC = (u, v) => {
        if (!parentChild.has(u)) parentChild.set(u, new Set());
        if (!parentChild.has(v)) parentChild.set(v, new Set());
        parentChild.get(u).add(v);
        parentChild.get(v).add(u);
    };
    this.relationships.forEach(r => addPC(r.parent_id, r.child_id));

    // 1) BFS lấy tập bloodline từ targetPersonId
    let startId = this.targetPersonId;
    if (!fullPeopleMap.has(startId) && this.people.length) {
        startId = this.people[0].id; // fallback
    }
    const bloodlineIds = new Set();
    const q = [startId];
    while (q.length) {
        const cur = q.shift();
        if (bloodlineIds.has(cur)) continue;
        bloodlineIds.add(cur);
        const neighbors = parentChild.get(cur);
        if (neighbors) {
            neighbors.forEach(n => { if (!bloodlineIds.has(n)) q.push(n); });
        }
    }

    // 2) Thêm vợ/chồng của các thành viên trong bloodline (để hiển thị cạnh thẻ)
    // Nhưng KHÔNG mở rộng sang cha mẹ/anh chị em của vợ/chồng.
    const spouseMapFull = new Map();
    this.spouseMap.clear();
    this.marriages.forEach(m => {
        if (m.husband_id && m.wife_id) {
            spouseMapFull.set(m.husband_id, m.wife_id);
            spouseMapFull.set(m.wife_id, m.husband_id);
        }
    });

    const spouseIdsToInclude = new Set();
    bloodlineIds.forEach(id => {
        const sp = spouseMapFull.get(id);
        if (sp && fullPeopleMap.has(sp)) spouseIdsToInclude.add(sp);
    });

    // 3) Tập người cần hiển thị = bloodline ∪ spouses (đính kèm)
    const relatedIds = new Set(bloodlineIds);
    spouseIdsToInclude.forEach(id => relatedIds.add(id));

    // 4) Lọc danh sách người
    const filteredPeople = this.people.filter(p => relatedIds.has(p.id));

    // 5) Cập nhật maps hiển thị
    this.peopleMap.clear();
    filteredPeople.forEach(p => this.peopleMap.set(p.id, p));

    // Chỉ giữ marriage nơi một đầu là người trong bloodline (để có thẻ vợ/chồng dính kèm)
    this.spouseMap.clear();
    this.marriages.forEach(m => {
        const a = m.husband_id, b = m.wife_id;
        const oneSideInBloodline = bloodlineIds.has(a) || bloodlineIds.has(b);
        if (oneSideInBloodline && relatedIds.has(a) && relatedIds.has(b)) {
            this.spouseMap.set(a, b);
            this.spouseMap.set(b, a);
        }
    });

    // ChildrenMap: chỉ thêm quan hệ cha–con nếu ÍT NHẤT một bên thuộc bloodline,
    // để không kéo con riêng của spouse nếu không thuộc nhánh của người mục tiêu.
    this.childrenMap.clear();
    this.relationships.forEach(r => {
        const keep =
            bloodlineIds.has(r.parent_id) ||
            bloodlineIds.has(r.child_id);

        if (keep && relatedIds.has(r.parent_id) && relatedIds.has(r.child_id)) {
            if (!this.childrenMap.has(r.parent_id)) {
                this.childrenMap.set(r.parent_id, new Set());
            }
            this.childrenMap.get(r.parent_id).add(r.child_id);
        }
    });

    // 6) Không vẽ lưới người không liên quan
    this.unrelatedPeople = [];
}

    async render(personId = null) {
        const loaded = await this.loadData(personId);
        if (!loaded && this.people.length === 0) {
            this.showEmptyState();
            return;
        }

        this.svg.innerHTML = '';
        this.nodesToRender = [];

        // --- XÁC ĐỊNH ROOT ---
const currentTargetId = personId || this.targetPersonId;
        let rootPerson = this.peopleMap.get(currentTargetId);

        // Nếu không tìm thấy người này (lỗi dữ liệu), fallback về cách cũ hoặc báo lỗi
        if (!rootPerson && this.people.length > 0) {
            rootPerson = this.people[0];
        }

        if (rootPerson) {
            // Thuật toán: Leo ngược lên trên (tìm cha/mẹ) cho đến khi không còn cha mẹ nào nữa
            // Đây chính là đỉnh của nhánh cây mà người này thuộc về
            while (true) {
                // Tìm mối quan hệ mà rootPerson đóng vai trò là CON (child_id)
                // Ưu tiên tìm CHA (thường là người mang họ của dòng tộc) nếu có cả cha và mẹ
                const parentRel = this.relationships.find(r => r.child_id === rootPerson.id);
                
                if (parentRel) {
                    // Nếu tìm thấy cha/mẹ, gán người đó làm rootPerson mới và tiếp tục lặp
                    const parent = this.peopleMap.get(parentRel.parent_id);
                    if (parent) {
                        rootPerson = parent;
                    } else {
                        break; // Dữ liệu cha mẹ bị thiếu, dừng tại đây
                    }
                } else {
                    // Không còn cha mẹ nào nữa -> Đã tìm thấy Cụ tổ
                    break;
                }
            }
        }

        // Mảng roots bây giờ chỉ chứa duy nhất 1 người (hoặc 0 nếu lỗi)
        let roots = rootPerson ? [rootPerson] : [];

        // --- TÍNH TOÁN VỊ TRÍ ---
        let startX = this.config.padding;
        const startY = this.config.padding;

        const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        mainGroup.setAttribute('id', 'mainGroup');
        this.svg.appendChild(mainGroup);

        roots.forEach(rootPerson => {
            const treeNode = this.buildTreeNode(rootPerson);
            this.calculateTreeSize(treeNode);
            this.calculateTreePosition(treeNode, startX, startY);
            this.flattenTree(treeNode);
            startX += treeNode.totalWidth + this.config.gapX * 2;
        });

        // --- VẼ ---
        let maxX = 0;
        let maxY = 0;

        // Vẽ đường nối
        this.nodesToRender.forEach(node => {
            if (node.childrenNodes.length > 0) {
                this.drawForkConnection(mainGroup, node);
            }
        });

        // Vẽ thẻ
        this.nodesToRender.forEach(node => {
            this.drawCard(mainGroup, node.person, node.x, node.y);
            
            if (node.spouse) {
                const spouseX = node.x + this.config.cardWidth + this.config.spouseGap;
                this.drawCard(mainGroup, node.spouse, spouseX, node.y);
                maxX = Math.max(maxX, spouseX + this.config.cardWidth);
            } else {
                maxX = Math.max(maxX, node.x + this.config.cardWidth);
            }
            maxY = Math.max(maxY, node.y + this.config.cardHeight);
        });

        // Vẽ Grid Unrelated
        if (this.unrelatedPeople.length > 0) {
            const gridStartY = maxY + 150;
            this.drawUnrelatedGrid(mainGroup, gridStartY, Math.max(maxX, 800));
            
            const rows = Math.ceil(this.unrelatedPeople.length / this.config.gridCols);
            const gridHeight = rows * (this.config.cardHeight + this.config.gridGapY) + 100;
            maxY = gridStartY + gridHeight;
        }

        // Cập nhật ViewBox
        const finalW = Math.max(maxX + this.config.padding, 1000); 
        const finalH = Math.max(maxY + this.config.padding, 800);
        this.svg.setAttribute('viewBox', `0 0 ${finalW} ${finalH}`);
        this.applyTransform();
    }

    // --- CÁC HÀM LOGIC CÂY (GIỮ NGUYÊN) ---

    buildTreeNode(person) {
        const spouseId = this.spouseMap.get(person.id);
        const spouse = spouseId ? this.peopleMap.get(spouseId) : null;
        
        const kidsSet = new Set();
        if (this.childrenMap.has(person.id)) this.childrenMap.get(person.id).forEach(id => kidsSet.add(id));
        if (spouse && this.childrenMap.has(spouse.id)) this.childrenMap.get(spouse.id).forEach(id => kidsSet.add(id));
        
        const children = Array.from(kidsSet)
            .map(id => this.peopleMap.get(id))
            .filter(p => p)
            .sort((a, b) => (a.birth_date || '').localeCompare(b.birth_date || ''));
            
        return {
            person: person,
            spouse: spouse,
            childrenNodes: children.map(c => this.buildTreeNode(c)),
            width: 0,
            totalWidth: 0,
            x: 0, y: 0
        };
    }

    calculateTreeSize(node) {
        let nodeSelfWidth = this.config.cardWidth;
        if (node.spouse) {
            nodeSelfWidth = this.config.cardWidth * 2 + this.config.spouseGap;
        }
        node.selfWidth = nodeSelfWidth;

        let childrenTotalWidth = 0;
        if (node.childrenNodes.length > 0) {
            node.childrenNodes.forEach(child => {
                this.calculateTreeSize(child);
                childrenTotalWidth += child.totalWidth;
            });
            childrenTotalWidth += (node.childrenNodes.length - 1) * this.config.gapX;
        }

        node.totalWidth = Math.max(nodeSelfWidth, childrenTotalWidth);
    }

    calculateTreePosition(node, x, y) {
        node.y = y;
        let nodeActualX = x + (node.totalWidth - node.selfWidth) / 2;
        node.x = nodeActualX;

        if (node.childrenNodes.length > 0) {
            const nextY = y + this.config.cardHeight + this.config.gapY;
            let childCurrentX = x + (node.totalWidth - this.getChildrenWidth(node)) / 2;

            node.childrenNodes.forEach(child => {
                this.calculateTreePosition(child, childCurrentX, nextY);
                childCurrentX += child.totalWidth + this.config.gapX;
            });
        }
    }

    getChildrenWidth(node) {
        if (node.childrenNodes.length === 0) return 0;
        let w = 0;
        node.childrenNodes.forEach(c => w += c.totalWidth);
        w += (node.childrenNodes.length - 1) * this.config.gapX;
        return w;
    }

    flattenTree(node) {
        this.nodesToRender.push(node);
        node.childrenNodes.forEach(c => this.flattenTree(c));
    }

    // --- CÁC HÀM VẼ (GIỮ NGUYÊN) ---

    drawForkConnection(group, node) {
        const startY = node.y + this.config.cardHeight;
        let startX;

        if (node.spouse) {
            startX = node.x + node.selfWidth / 2;
        } else {
            startX = node.x + this.config.cardWidth / 2;
        }

        const midY = startY + this.config.gapY / 2;

        this.createLine(group, startX, startY, startX, midY);

        const firstChild = node.childrenNodes[0];
        const lastChild = node.childrenNodes[node.childrenNodes.length - 1];

        const getChildCenterX = (n) => {
             return n.spouse 
                ? n.x + n.selfWidth / 2 
                : n.x + this.config.cardWidth / 2;
        };

        const minChildX = getChildCenterX(firstChild);
        const maxChildX = getChildCenterX(lastChild);

        this.createLine(group, minChildX, midY, maxChildX, midY);

        node.childrenNodes.forEach(child => {
            const childX = getChildCenterX(child);
            this.createLine(group, childX, midY, childX, child.y);
        });
    }

    createLine(group, x1, y1, x2, y2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', this.config.colors.line);
        line.setAttribute('stroke-width', '2');
        group.appendChild(line);
    }

    drawCard(group, person, x, y) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${x}, ${y})`);
        g.style.cursor = 'pointer';
        g.onclick = () => this.showPersonDetail(person);

        const isMale = person.gender === 'Nam';
        const isDead = !person.is_alive || person.death_date;

        const bgColor = isDead ? this.config.colors.deadBg : (isMale ? this.config.colors.maleBg : this.config.colors.femaleBg);
        const strokeColor = isMale ? this.config.colors.maleBorder : this.config.colors.femaleBorder;
        const textColor = isDead ? this.config.colors.deadText : this.config.colors.textName;

        // Background
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', this.config.cardWidth);
        rect.setAttribute('height', this.config.cardHeight);
        rect.setAttribute('rx', '12');
        rect.setAttribute('fill', bgColor);
        rect.setAttribute('stroke', strokeColor);
        rect.setAttribute('stroke-width', '2');
        g.appendChild(rect);

        // Avatar
        const clipId = `clip-${person.id}`;
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', clipId);
        
        const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        clipRect.setAttribute('x', (this.config.cardWidth - this.config.avatarSize) / 2);
        clipRect.setAttribute('y', 15);
        clipRect.setAttribute('width', this.config.avatarSize);
        clipRect.setAttribute('height', this.config.avatarSize);
        clipRect.setAttribute('rx', '8');
        clipPath.appendChild(clipRect);
        defs.appendChild(clipPath);
        g.appendChild(defs);

        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('x', (this.config.cardWidth - this.config.avatarSize) / 2);
        img.setAttribute('y', 15);
        img.setAttribute('width', this.config.avatarSize);
        img.setAttribute('height', this.config.avatarSize);
        img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        img.setAttribute('clip-path', `url(#${clipId})`);
        
        const avatarUrl = person.avatar_url || (isMale 
            ? 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png' 
            : 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png');
        img.setAttribute('href', avatarUrl);
        g.appendChild(img);

        const imgBorder = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        imgBorder.setAttribute('x', (this.config.cardWidth - this.config.avatarSize) / 2);
        imgBorder.setAttribute('y', 15);
        imgBorder.setAttribute('width', this.config.avatarSize);
        imgBorder.setAttribute('height', this.config.avatarSize);
        imgBorder.setAttribute('rx', '8');
        imgBorder.setAttribute('fill', 'none');
        imgBorder.setAttribute('stroke', strokeColor);
        imgBorder.setAttribute('stroke-width', '1');
        g.appendChild(imgBorder);

        // Tên
        const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nameText.setAttribute('x', this.config.cardWidth / 2);
        nameText.setAttribute('y', 120);
        nameText.setAttribute('text-anchor', 'middle');
        nameText.setAttribute('font-weight', 'bold');
        nameText.setAttribute('font-size', '14');
        nameText.setAttribute('fill', textColor);
        
        let nameDisplay = person.full_name || 'Không tên';
        if(nameDisplay.length > 18) nameDisplay = nameDisplay.substring(0, 16) + '..';
        nameText.textContent = nameDisplay;
        g.appendChild(nameText);

        // Năm sinh
        const yearText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        yearText.setAttribute('x', this.config.cardWidth / 2);
        yearText.setAttribute('y', 140);
        yearText.setAttribute('text-anchor', 'middle');
        yearText.setAttribute('font-size', '12');
        yearText.setAttribute('fill', isDead ? '#9ca3af' : '#4b5563');
        const birthYear = person.birth_date ? new Date(person.birth_date).getFullYear() : '?';
        yearText.textContent = `s. ${birthYear}`;
        g.appendChild(yearText);

        // RIP hoặc Đời
        if (isDead) {
            const ripText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            ripText.setAttribute('x', this.config.cardWidth / 2);
            ripText.setAttribute('y', 170);
            ripText.setAttribute('text-anchor', 'middle');
            ripText.setAttribute('font-weight', 'bold');
            ripText.setAttribute('font-size', '16');
            ripText.setAttribute('fill', '#fbbf24');
            ripText.textContent = 'RIP';
            g.appendChild(ripText);
        } else {
             const genText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
             genText.setAttribute('x', this.config.cardWidth / 2);
             genText.setAttribute('y', 165);
             genText.setAttribute('text-anchor', 'middle');
             genText.setAttribute('font-size', '12');
             genText.setAttribute('fill', strokeColor);
             genText.textContent = `Đời ${person.generation || '?'}`;
             g.appendChild(genText);
        }

        group.appendChild(g);
    }

    drawUnrelatedGrid(parent, startY, currentMaxX) {
        const total = this.unrelatedPeople.length;
        if (total === 0) return;

        let cols = Math.ceil(Math.sqrt(total * 3));
        if (cols < 6) cols = 6;

        // Tiêu đề
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        title.setAttribute('x', this.config.padding);
        title.setAttribute('y', startY - 40);
        title.setAttribute('font-size', '20');
        title.setAttribute('font-weight', 'bold');
        title.setAttribute('fill', '#dc2626');
        title.textContent = `⚠ CHƯA XÁC ĐỊNH QUAN HỆ (${total})`;
        parent.appendChild(title);

        const gridWidth = cols * (this.config.cardWidth + this.config.gridGapX);
        const lineWidth = Math.max(currentMaxX, gridWidth + this.config.padding);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', this.config.padding);
        line.setAttribute('y1', startY - 20);
        line.setAttribute('x2', lineWidth);
        line.setAttribute('y2', startY - 20);
        line.setAttribute('stroke', '#9ca3af');
        line.setAttribute('stroke-dasharray', '8,8');
        line.setAttribute('stroke-width', '2');
        parent.appendChild(line);

        const startX = this.config.padding;

        this.unrelatedPeople.forEach((p, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            
            const x = startX + c * (this.config.cardWidth + this.config.gridGapX);
            const y = startY + r * (this.config.cardHeight + this.config.gridGapY);
            
            this.drawCard(parent, p, x, y);
        });
    }

    // --- TIỆN ÍCH ---

    showPersonDetail(person) {
        const modal = document.createElement('div');
        modal.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: sans-serif;`;
        
        const content = document.createElement('div');
        content.style.cssText = `background: white; padding: 25px; border-radius: 12px; max-width: 500px; width: 90%; position: relative; box-shadow: 0 10px 25px rgba(0,0,0,0.5);`;
        
        const avatarUrl = person.avatar_url || 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png';
        
        content.innerHTML = `
            <div style="display: flex; gap: 20px; align-items: start; margin-bottom: 20px;">
                <img src="${avatarUrl}" style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover; background: #eee;">
                <div>
                    <h2 style="margin: 0 0 5px 0; color: #111827;">${person.full_name || 'Không tên'}</h2>
                    <span style="background: ${person.is_alive ? '#dcfce7' : '#374151'}; color: ${person.is_alive ? '#166534' : '#fff'}; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold;">
                        ${person.is_alive ? 'Còn sống' : 'Đã mất'}
                    </span>
                    <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Đời thứ: ${person.generation || '?'}</p>
                </div>
            </div>
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; font-size: 14px; line-height: 1.6; color: #374151;">
                <p><strong>Ngày sinh:</strong> ${person.birth_date || 'Chưa rõ'}</p>
                ${person.death_date ? `<p><strong>Ngày mất:</strong> ${person.death_date}</p>` : ''}
                <p><strong>Tiểu sử:</strong> ${person.biography || 'Chưa có thông tin'}</p>
            </div>
            <button id="closeBtn" style="margin-top: 15px; width: 100%; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Đóng</button>
            <button id="showTreeBtn" style="margin-top: 10px; width: 100%; padding: 10px; background: #16a34a; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Xem cây gia phả của ${person.full_name}</button>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        document.getElementById('closeBtn').onclick = () => document.body.removeChild(modal);
        document.getElementById('showTreeBtn').onclick = () => {
            document.body.removeChild(modal);
            this.render(person.id); // Hiển thị lại cây với người này làm trung tâm
        };
        modal.onclick = (e) => { if(e.target === modal) document.body.removeChild(modal); };
    }

    getSVGPoint(clientX, clientY) {
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return { x: clientX, y: clientY };

        const pt = this.svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const sp = pt.matrixTransform(ctm.inverse());
        return { x: sp.x, y: sp.y };
    }

    // --- PAN & ZOOM (GIỮ NGUYÊN) ---
    setupPanZoom() {
        this.svg.style.touchAction = 'none';
        this.svg.style.cursor = 'grab';

        this.svg.addEventListener('click', (e) => {
            if (!this.view.suppressClick) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            this.view.suppressClick = false;
        }, true);

        this.svg.addEventListener('wheel', (event) => {
            event.preventDefault();

            const mouse = this.getSVGPoint(event.clientX, event.clientY);
            const oldScale = this.scale;

            const zoomIntensity = 0.01
            const factor = Math.exp(-event.deltaY * zoomIntensity);

            let newScale = oldScale * factor;
            newScale = Math.max(0.3, Math.min(50, newScale));

            if (Math.abs(newScale - oldScale) < 1e-6) return;

            const wx = (mouse.x - this.view.pointX) / oldScale;
            const wy = (mouse.y - this.view.pointY) / oldScale;

            this.scale = newScale;
            this.view.pointX = mouse.x - wx * newScale;
            this.view.pointY = mouse.y - wy * newScale;

            this.applyTransform();
        }, { passive: false });

        const DRAG_THRESHOLD_PX = 3;

        this.svg.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;

            this.view.panning = true;
            this.view.moved = false;
            this.view.suppressClick = false;

            this.view.startClientX = event.clientX;
            this.view.startClientY = event.clientY;

            const p = this.getSVGPoint(event.clientX, event.clientY);
            this.view.startX = p.x;
            this.view.startY = p.y;

            this.view.originX = this.view.pointX;
            this.view.originY = this.view.pointY;

            this.svg.style.cursor = 'grabbing';

            if (event.target && event.target.setPointerCapture) {
                event.target.setPointerCapture(event.pointerId);
            }
        });

        this.svg.addEventListener('pointermove', (event) => {
            if (!this.view.panning) return;

            const p = this.getSVGPoint(event.clientX, event.clientY);
            const dx = p.x - this.view.startX;
            const dy = p.y - this.view.startY;

            this.view.pointX = this.view.originX + dx;
            this.view.pointY = this.view.originY + dy;

            if (!this.view.moved) {
                const ddx = event.clientX - this.view.startClientX;
                const ddy = event.clientY - this.view.startClientY;
                if (Math.hypot(ddx, ddy) > DRAG_THRESHOLD_PX) this.view.moved = true;
            }

            this.applyTransform();
        });

        const endPan = (event) => {
            if (!this.view.panning) return;
            this.view.panning = false;

            this.view.suppressClick = this.view.moved;

            this.svg.style.cursor = 'grab';

            if (event.target && event.target.releasePointerCapture) {
                try { event.target.releasePointerCapture(event.pointerId); } catch (_) {}
            }
        };

        this.svg.addEventListener('pointerup', endPan);
        this.svg.addEventListener('pointercancel', endPan);
    }

    applyTransform() {
        const g = this.svg.querySelector('#mainGroup');
        if (g) {
            g.setAttribute('transform', `translate(${this.view.pointX}, ${this.view.pointY}) scale(${this.scale})`);
        }
    }

    resetZoom() {
        this.scale = 1;
        this.view.pointX = 0;
        this.view.pointY = 0;
        this.applyTransform();
    }

    showEmptyState() {
        this.svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#9ca3af" font-size="20">Chưa có dữ liệu gia phả</text>`;
    }
    
    showError(msg) {
        this.svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#ef4444" font-size="20">Error: ${msg}</text>`;
    }

// REPLACE toàn bộ hàm imageToDataURL bằng:
async imageToDataURL(url) {
    // Hỗ trợ cả đường dẫn tương đối
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, window.location.origin).href;
    const resp = await fetch(absoluteUrl, { mode: 'cors', credentials: 'omit' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
// REPLACE toàn bộ hàm exportPDF bằng:
async exportPDF() {
    this.showNotification('📄 Đang tạo file PDF...');

    try {
        const svg = this.svg;
        const mainGroup = svg.querySelector('#mainGroup');
        if (!mainGroup) throw new Error("Không tìm thấy dữ liệu cây");

        // 1. Lấy kích thước sơ đồ
        const vbAttr = svg.getAttribute('viewBox');
        let w = 1200, h = 800;
        if (vbAttr) {
            const parts = vbAttr.split(' ').map(Number);
            w = parts[2] || 1200;
            h = parts[3] || 800;
        }

        // 2. TẠO CHUỖI SVG SẠCH (Không clone để tránh lỗi thuộc tính lạ)
        // Chúng ta chỉ lấy phần nội dung đồ họa bên trong mainGroup
        let content = mainGroup.innerHTML;

        // Loại bỏ các thẻ gây lỗi parse
        content = content.replace(/<image[^>]*>|<\/image>/g, ''); // Xóa sạch thẻ image
        content = content.replace(/clip-path="url\([^)]*\)"/g, ''); // Xóa thuộc tính clip-path

        // Bọc vào một thẻ SVG hoàn chỉnh với namespace chuẩn
        const cleanSvgStr = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
                <rect width="100%" height="100%" fill="white"/>
                <g>${content}</g>
            </svg>
        `.trim();

        // 3. Chuyển đổi sang Base64
        const base64Svg = window.btoa(unescape(encodeURIComponent(cleanSvgStr)));
        const dataUrl = 'data:image/svg+xml;base64,' + base64Svg;

        // 4. Vẽ lên Canvas
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        const imgEl = new Image();
        await new Promise((resolve, reject) => {
            imgEl.onload = resolve;
            imgEl.onerror = () => reject(new Error("Lỗi render sơ đồ"));
            imgEl.src = dataUrl;
        });

        ctx.drawImage(imgEl, 0, 0);

        // 5. Xuất PDF bằng jsPDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: w > h ? 'l' : 'p',
            unit: 'px',
            format: [w, h]
        });

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, w, h);
        pdf.save(`gia-pha-${Date.now()}.pdf`);

        this.showNotification('✅ Xuất PDF thành công!');
    } catch (error) {
        console.error('Lỗi xuất PDF:', error);
        this.showNotification('❌ Lỗi: ' + error.message, true);
    }
}

    showNotification(message, isError = false) {
        let box = document.getElementById('treeNotify');

        if (!box) {
            box = document.createElement('div');
            box.id = 'treeNotify';
            box.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: ${isError ? '#dc2626' : '#111827'};
                color: white;
                padding: 10px 16px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 9999;
                box-shadow: 0 8px 20px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(box);
        }

        box.textContent = message;
        box.style.display = 'block';

        clearTimeout(box._timer);
        box._timer = setTimeout(() => {
            box.style.display = 'none';
        }, 3000);
    }
}

// Export global
window.FamilyTreeRenderer = FamilyTreeRenderer;

