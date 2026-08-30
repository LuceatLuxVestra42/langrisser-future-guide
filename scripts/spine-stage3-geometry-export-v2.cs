using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Spine;

sealed class PagePathTextureLoaderV2 : TextureLoader {
    public void Load(AtlasPage page, string path) { page.rendererObject = path; }
    public void Unload(object texture) { }
}

sealed class DrawItemV2 {
    public int drawIndex { get; set; }
    public string slotName { get; set; }
    public string attachmentName { get; set; }
    public string attachmentType { get; set; }
    public string blendMode { get; set; }
    public string atlasRegion { get; set; }
    public string atlasPage { get; set; }
    public bool atlasRegionRotate { get; set; }
    public float[] vertices { get; set; }
    public float[] uvs { get; set; }
    public int[] triangles { get; set; }
    public float[] color { get; set; }
}

sealed class ExportResultV2 {
    public int schemaVersion { get; set; } = 2;
    public string runtimeSourceCommit { get; set; }
    public string skeletonVersion { get; set; }
    public string animationName { get; set; }
    public float animationTime { get; set; }
    public string requestedInitialSkinName { get; set; }
    public string appliedSkinName { get; set; }
    public int drawItemCount { get; set; }
    public Dictionary<string,int> attachmentTypeCounts { get; set; }
    public Dictionary<string,int> blendModeCounts { get; set; }
    public float[] worldBounds { get; set; }
    public List<DrawItemV2> drawItems { get; set; }
}

static class Program {
    const string RuntimeCommit = "1c1936532527900f74cfb58f7002998bf157b254";

    static float[] ColorFor(Skeleton skeleton, Slot slot, float ar, float ag, float ab, float aa) {
        return new [] {
            skeleton.R * slot.R * ar,
            skeleton.G * slot.G * ag,
            skeleton.B * slot.B * ab,
            skeleton.A * slot.A * aa,
        };
    }

    static void Main(string[] args) {
        if (args.Length < 3) {
            Console.Error.WriteLine("usage: geometry-export-v2 <skel> <atlas> <output-json> [animation=idle_Normal] [time=0] [initialSkinName]");
            Environment.Exit(2);
        }
        string skelPath = args[0];
        string atlasPath = args[1];
        string outputPath = args[2];
        string animationName = args.Length >= 4 ? args[3] : "idle_Normal";
        float animationTime = args.Length >= 5 ? float.Parse(args[4], System.Globalization.CultureInfo.InvariantCulture) : 0f;
        string requestedInitialSkinName = args.Length >= 6 ? args[5] : "";

        var atlas = new Atlas(atlasPath, new PagePathTextureLoaderV2());
        var binary = new SkeletonBinary(atlas);
        var data = binary.ReadSkeletonData(skelPath);
        var skeleton = new Skeleton(data);

        if (!String.IsNullOrEmpty(requestedInitialSkinName)) {
            var selectedSkin = data.FindSkin(requestedInitialSkinName);
            if (selectedSkin == null)
                throw new Exception("BLOCK_INITIAL_SKIN_NOT_FOUND:" + requestedInitialSkinName);
            skeleton.Skin = selectedSkin;
        }
        skeleton.SetToSetupPose();
        string appliedSkinName = skeleton.Skin != null ? skeleton.Skin.Name : null;

        var animation = data.FindAnimation(animationName);
        if (animation == null)
            throw new Exception("BLOCK_IDLE_NORMAL_ABSENT:" + animationName);
        animation.Apply(skeleton, 0f, animationTime, true, null);
        skeleton.UpdateWorldTransform();

        var items = new List<DrawItemV2>();
        var typeCounts = new Dictionary<string,int>();
        var blendCounts = new Dictionary<string,int>();
        float minX = float.PositiveInfinity, minY = float.PositiveInfinity;
        float maxX = float.NegativeInfinity, maxY = float.NegativeInfinity;

        for (int i = 0; i < skeleton.DrawOrder.Count; i++) {
            Slot slot = skeleton.DrawOrder.Items[i];
            var attachment = slot.Attachment;
            if (attachment == null) continue;

            DrawItemV2 item = null;
            if (attachment is RegionAttachment regionAttachment) {
                var world = new float[8];
                regionAttachment.ComputeWorldVertices(slot.Bone, world);
                var atlasRegion = regionAttachment.RendererObject as AtlasRegion;
                if (atlasRegion == null) continue;
                item = new DrawItemV2 {
                    drawIndex = i,
                    slotName = slot.Data.Name,
                    attachmentName = regionAttachment.Name,
                    attachmentType = "RegionAttachment",
                    blendMode = slot.Data.BlendMode.ToString(),
                    atlasRegion = atlasRegion.name,
                    atlasPage = atlasRegion.page.name,
                    atlasRegionRotate = atlasRegion.rotate,
                    vertices = world,
                    uvs = regionAttachment.UVs.ToArray(),
                    triangles = new [] { 0, 1, 2, 2, 3, 0 },
                    color = ColorFor(skeleton, slot, regionAttachment.R, regionAttachment.G, regionAttachment.B, regionAttachment.A),
                };
            } else if (attachment is MeshAttachment meshAttachment) {
                var world = new float[meshAttachment.WorldVerticesLength];
                meshAttachment.ComputeWorldVertices(slot, world);
                var atlasRegion = meshAttachment.RendererObject as AtlasRegion;
                if (atlasRegion == null) continue;
                item = new DrawItemV2 {
                    drawIndex = i,
                    slotName = slot.Data.Name,
                    attachmentName = meshAttachment.Name,
                    attachmentType = "MeshAttachment",
                    blendMode = slot.Data.BlendMode.ToString(),
                    atlasRegion = atlasRegion.name,
                    atlasPage = atlasRegion.page.name,
                    atlasRegionRotate = atlasRegion.rotate,
                    vertices = world,
                    uvs = meshAttachment.UVs.ToArray(),
                    triangles = meshAttachment.Triangles.ToArray(),
                    color = ColorFor(skeleton, slot, meshAttachment.R, meshAttachment.G, meshAttachment.B, meshAttachment.A),
                };
            }
            if (item == null) continue;
            items.Add(item);
            typeCounts[item.attachmentType] = typeCounts.TryGetValue(item.attachmentType, out var tc) ? tc + 1 : 1;
            blendCounts[item.blendMode] = blendCounts.TryGetValue(item.blendMode, out var bc) ? bc + 1 : 1;
            for (int v = 0; v + 1 < item.vertices.Length; v += 2) {
                minX = Math.Min(minX, item.vertices[v]);
                minY = Math.Min(minY, item.vertices[v + 1]);
                maxX = Math.Max(maxX, item.vertices[v]);
                maxY = Math.Max(maxY, item.vertices[v + 1]);
            }
        }

        if (items.Count == 0)
            throw new Exception("BLOCK_NO_RENDERABLE_ATTACHMENT:No renderable RegionAttachment/MeshAttachment found in draw order.");

        var result = new ExportResultV2 {
            runtimeSourceCommit = RuntimeCommit,
            skeletonVersion = data.Version,
            animationName = animationName,
            animationTime = animationTime,
            requestedInitialSkinName = requestedInitialSkinName,
            appliedSkinName = appliedSkinName,
            drawItemCount = items.Count,
            attachmentTypeCounts = typeCounts,
            blendModeCounts = blendCounts,
            worldBounds = new [] { minX, minY, maxX, maxY },
            drawItems = items,
        };
        var options = new JsonSerializerOptions { WriteIndented = true };
        File.WriteAllText(outputPath, JsonSerializer.Serialize(result, options));
        Console.WriteLine(JsonSerializer.Serialize(new {
            outputPath,
            result.skeletonVersion,
            result.animationName,
            result.animationTime,
            result.requestedInitialSkinName,
            result.appliedSkinName,
            result.drawItemCount,
            result.attachmentTypeCounts,
            result.blendModeCounts,
            result.worldBounds,
        }));
    }
}
