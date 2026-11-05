-- Ragdoll MMA God Hub v17 (Eagle Dive Pounding + Max Kinetic Damage + Friends Whitelist)
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")
local CoreGui = game:GetService("CoreGui")

local LocalPlayer = Players.LocalPlayer

-- НАСТРОЙКИ КЛАВИШ
local MAGNET_KEY = Enum.KeyCode.X     
local MENU_TOGGLE_KEY = Enum.KeyCode.RightShift 
local UNLOAD_KEY = Enum.KeyCode.K     

-- НАСТРОЙКИ ТАКТИКИ ОРЛА
local COMBAT_SPEED = 180              
local COMBAT_RADIUS = 2.8             
local FLY_HEIGHT = 35                 -- Высота взлета над врагом (в studs)
local ATTACK_DURATION = 3.0           -- Сколько секунд пиздить врага перед следующим взлетом

-- СОСТОЯНИЯ
local autoAntiFall = true
local isMagnetActive = false
local menuVisible = true
local connections = {}
local GUI_NAME = "MMAGodHubV17"

local magnetAttachments = {}
local targetAttachments = {}
local alignPositions = {}

local combatLimbs = {"LeftHand", "RightHand", "LeftFoot", "RightFoot"}
local eagleRoutineActive = false

-- Авто-очистка старых окон
local oldGui = CoreGui:FindFirstChild(GUI_NAME) or LocalPlayer:WaitForChild("PlayerGui"):FindFirstChild(GUI_NAME)
if oldGui then oldGui:Destroy() end

local function getRoot(player)
	return player.Character and player.Character:FindFirstChild("HumanoidRootPart")
end

-- ПРОВЕРКА НА ДРУГА
local function isFriend(player)
    if player == LocalPlayer then return true end
    local success, result = pcall(function()
        return LocalPlayer:IsFriendsWith(player.UserId)
    end)
    return success and result
end

-- ПОИСК БЛИЖАЙШЕЙ ЖИВОЙ ЦЕЛИ
local function getNearestTarget()
    local myRoot = getRoot(LocalPlayer)
    if not myRoot then return nil end
    
    local nearest, nearestDist = nil, math.huge
    for _, other in ipairs(Players:GetPlayers()) do
        if other ~= LocalPlayer and not isFriend(other) then
            local char = other.Character
            local humanoid = char and char:FindFirstChildOfClass("Humanoid")
            local root = char and char:FindFirstChild("HumanoidRootPart")
            if root and humanoid and humanoid.Health > 0 then
                local d = (root.Position - myRoot.Position).Magnitude
                if d < nearestDist then nearest, nearestDist = root, d end
            end
        end
    end
    for _, obj in ipairs(workspace:GetChildren()) do
        if obj:IsA("Model") and obj ~= LocalPlayer.Character and obj:FindFirstChild("HumanoidRootPart") and obj:FindFirstChildOfClass("Humanoid") then
            if not Players:GetPlayerFromCharacter(obj) then
                local humanoid = obj:FindFirstChildOfClass("Humanoid")
                local root = obj.HumanoidRootPart
                if root and humanoid and humanoid.Health > 0 then
                    local d = (root.Position - myRoot.Position).Magnitude
                    if d < nearestDist then nearest, nearestDist = root, d end
                end
            end
        end
    end
    return nearest
end

-- КИНЕТИЧЕСКИЙ ЗАПУСК МАГНИТА
local function startFullMagnet()
    local character = LocalPlayer.Character
    local targetRoot = getNearestTarget()
    local targetChar = targetRoot and targetRoot.Parent
    local targetHead = targetChar and targetChar:FindFirstChild("Head")
    
    if not character or not targetHead or isMagnetActive then return end
    isMagnetActive = true
    
    for _, limbName in ipairs(combatLimbs) do
        local limbPart = character:FindFirstChild(limbName)
        if limbPart and limbPart:IsA("BasePart") then
            local mAtt = Instance.new("Attachment")
            mAtt.Name = "MagnetAtt_" .. limbName
            mAtt.Parent = limbPart
            magnetAttachments[limbName] = mAtt
            
            local tAtt = Instance.new("Attachment")
            tAtt.Name = "TargetAtt_" .. limbName
            tAtt.Parent = targetHead
            targetAttachments[limbName] = tAtt
            
            local alignPos = Instance.new("AlignPosition")
            alignPos.Name = "LimbForce_" .. limbName
            alignPos.Mode = Enum.PositionAlignmentMode.TwoAttachment
            alignPos.Attachment0 = mAtt
            alignPos.Attachment1 = tAtt
            -- КРИТИЧЕСКИЙ ИМПУЛЬС: Притягиваем со всей силы для разгона урона
            alignPos.MaxForce = 300000 
            alignPos.Responsiveness = 200
            alignPos.Parent = limbPart
            alignPositions[limbName] = alignPos
        end
    end
end

local function stopFullMagnet()
    isMagnetActive = false
    for _, alignPos in pairs(alignPositions) do if alignPos then alignPos:Destroy() end end
    for _, mAtt in pairs(magnetAttachments) do if mAtt then mAtt:Destroy() end end
    for _, tAtt in pairs(targetAttachments) do if tAtt then tAtt:Destroy() end end
    alignPositions = {}
    magnetAttachments = {}
    targetAttachments = {}
end

-- АВТОМАТИЧЕСКИЙ ЦИКЛ НАЛЁТА (EAGLE ROUTINE)
local function runEagleRoutine()
    eagleRoutineActive = true
    
    task.spawn(function()
        while eagleRoutineActive do
            local character = LocalPlayer.Character
            local hrp = character and character:FindFirstChild("HumanoidRootPart")
            local targetRoot = getNearestTarget()
            
            if hrp and targetRoot then
                -- 1. ЭТАП ВЗЛЕТА: Подбрасываем персонажа строго вверх над врагом
                stopFullMagnet() -- Отпускаем, чтобы взлететь
                
                -- Сбрасываем старую скорость рэгдолла
                for _, part in ipairs(character:GetChildren()) do
                    if part:IsA("BasePart") then part.Velocity = Vector3.zero end
                end
                
                -- Телепортируем на высоту над соперником
                character:PivotTo(CFrame.new(targetRoot.Position + Vector3.new(0, FLY_HEIGHT, 0), targetRoot.Position))
                task.wait(0.25) -- Микро-пауза в воздухе для накопления инерции падения
                
                if not eagleRoutineActive then break end
                
                -- 2. ЭТАП НАЛЁТА И КОМБО: Врубаем магнит и пиздим 3 секунды
                startFullMagnet()
                task.wait(ATTACK_DURATION)
            else
                task.wait(0.5) -- Если врагов нет, просто ждем
            end
        end
    end)
end

local function stopEagleRoutine()
    eagleRoutineActive = false
    stopFullMagnet()
end

-- ОСНОВНОЙ ПОТОК ФИЗИКИ И ВИБРАЦИИ
connections.mainLoop = RunService.Heartbeat:Connect(function()
    local character = LocalPlayer.Character
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    local hrp = character and character:FindFirstChild("HumanoidRootPart")

    -- Смягчение рэгдолла костей
    if hrp and humanoid then
        if humanoid:GetState() == Enum.HumanoidStateType.Ragdoll or hrp.RotVelocity.Magnitude > 6 then
            hrp.RotVelocity = Vector3.zero
            for _, limbName in ipairs(combatLimbs) do
                local limb = character:FindFirstChild(limbName)
                if limb then limb.Velocity = hrp.Velocity end
            end
        end
    end

    -- Анти-падение (работает только когда мы не в режиме налёта орла)
    if autoAntiFall and humanoid and hrp and not eagleRoutineActive then
        if humanoid:GetState() == Enum.HumanoidStateType.Ragdoll or hrp.Velocity.Y < -8 then
            hrp.RotVelocity = Vector3.zero
            hrp.Velocity = Vector3.new(hrp.Velocity.X, 1, hrp.Velocity.Z)
            local look = hrp.CFrame.LookVector
            hrp.CFrame = CFrame.new(hrp.Position, hrp.Position + Vector3.new(look.X, 0, look.Z))
            humanoid:ChangeState(Enum.HumanoidStateType.GettingUp)
        end
    end
    
    -- Гиперзвуковая дрыгалка урона внутри головы
    if isMagnetActive then
        local targetRoot = getNearestTarget()
        local targetChar = targetRoot and targetRoot.Parent
        local targetHead = targetChar and targetChar:FindFirstChild("Head")
        local targetHumanoid = targetChar and targetChar:FindFirstChildOfClass("Humanoid")
        
        if not targetHead or (targetHumanoid and targetHumanoid.Health <= 0) then
            stopFullMagnet()
            return
        end
        
        local timeClock = os.clock() * COMBAT_SPEED
        local offsetX = math.sin(timeClock) * COMBAT_RADIUS + math.random(-5, 5) / 10
        local offsetY = math.cos(timeClock) * COMBAT_RADIUS + math.random(-5, 5) / 10
        local offsetZ = math.sin(timeClock * 1.6) * COMBAT_RADIUS + math.random(-5, 5) / 10
        
        for _, tAtt in pairs(targetAttachments) do
            if tAtt and tAtt.Parent == targetHead then
                tAtt.Position = Vector3.new(offsetX, offsetY, offsetZ)
            elseif tAtt and targetHead then
                tAtt.Parent = targetHead
            end
        end
    end
end)

-- Нажатия клавиш
connections.inputBegan = UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    if input.KeyCode == MAGNET_KEY then
        runEagleRoutine()
    elseif input.KeyCode == MENU_TOGGLE_KEY then
        menuVisible = not menuVisible
        MainFrame.Visible = menuVisible
    elseif input.KeyCode == UNLOAD_KEY then
        stopEagleRoutine()
        autoAntiFall = false
        for _, connection in pairs(connections) do if connection then connection:Disconnect() end end
        connections = {}
        if ScreenGui then ScreenGui:Destroy() end
        print("God Hub v17 полностью выгружен.")
    end
end)

connections.inputEnded = UserInputService.InputEnded:Connect(function(input)
    if input.KeyCode == MAGNET_KEY then
        stopEagleRoutine()
    end
end)

----------------------------------------------------------------
-- ИНТЕРФЕЙС GUI МЕНЮ v17
----------------------------------------------------------------
local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = GUI_NAME; ScreenGui.ResetOnSpawn = false
pcall(function() ScreenGui.Parent = CoreGui end)
if not ScreenGui.Parent then ScreenGui.Parent = LocalPlayer:WaitForChild("PlayerGui") end
local MainFrame = Instance.new("Frame")
MainFrame.Size = UDim2.new(0, 230, 0, 210)
MainFrame.Position = UDim2.new(0.05, 0, 0.3, 0)
MainFrame.BackgroundColor3 = Color3.fromRGB(15, 15, 18)
MainFrame.BorderSizePixel = 0; MainFrame.Active = true; MainFrame.Draggable = true; MainFrame.Parent = ScreenGui
local MainCorner = Instance.new("UICorner")
MainCorner.CornerRadius = UDim.new(0, 12); MainCorner.Parent = MainFrame
local Title = Instance.new("TextLabel")
Title.Size = UDim2.new(1, 0, 0, 42); Title.BackgroundColor3 = Color3.fromRGB(22, 22, 28)
Title.Text = "🦅 RAGDOLL MMA EAGLE v17 🦅"; Title.TextColor3 = Color3.fromRGB(46, 204, 113)
Title.Font = Enum.Font.GothamBold; Title.TextSize = 11; Title.Parent = MainFrame
local TitleCorner = Instance.new("UICorner")
TitleCorner.CornerRadius = UDim.new(0, 12); TitleCorner.Parent = Title
local function createToggle(text, position, default_state, callback)
local btn = Instance.new("TextButton")
btn.Size = UDim2.new(0, 190, 0, 34); btn.Position = position; btn.Font = Enum.Font.GothamSemibold; btn.TextSize = 11; btn.Parent = MainFrame
Instance.new("UICorner").Parent = btn
local state = default_state
local function updateVisual()
btn.BackgroundColor3 = state and Color3.fromRGB(39, 174, 96) or Color3.fromRGB(192, 41, 43)
btn.Text = state and text..": АКТИВЕН" or text..": ВЫКЛЮЧЕН"
btn.TextColor3 = Color3.new(1, 1, 1)
end
updateVisual()
btn.MouseButton1Click:Connect(function() state = not state updateVisual() callback(state) end)
end
createToggle("🛡️ Авто-Вставание (Anti-Fall)", UDim2.new(0, 20, 0, 58), true, function(v) autoAntiFall = v end)
local function createBindLabel(text, position)
local lbl = Instance.new("TextLabel")
lbl.Size = UDim2.new(0, 190, 0, 22); lbl.Position = position; lbl.BackgroundColor3 = Color3.fromRGB(25, 25, 32); lbl.TextColor3 = Color3.fromRGB(200, 200, 200); lbl.Font = Enum.Font.Gotham; lbl.TextSize = 9; lbl.Text = text; lbl.Parent = MainFrame
Instance.new("UICorner").Parent = lbl
end
createBindLabel("🦅 Зажми X: Режим Налёта Орла (Взлет + 3с комбо)", UDim2.new(0, 20, 0, 102))
createBindLabel("💥 Авто-доводка и урон по спирали хаоса", UDim2.new(0, 20, 0, 130))
local UnloadBtn = Instance.new("TextButton")
UnloadBtn.Size = UDim2.new(0, 190, 0, 32); UnloadBtn.Position = UDim2.new(0, 20, 0, 162); UnloadBtn.BackgroundColor3 = Color3.fromRGB(40, 40, 50)
UnloadBtn.Text = "🛑 ВЫГРУЗИТЬ ХАБ (K)"; UnloadBtn.TextColor3 = Color3.fromRGB(231, 76, 60); UnloadBtn.Font = Enum.Font.GothamBold; UnloadBtn.TextSize = 10; UnloadBtn.Parent = MainFrame
Instance.new("UICorner").Parent = UnloadBtn
UnloadBtn.MouseButton1Click:Connect(function()
stopEagleRoutine()
autoAntiFall = false
for _, connection in pairs(connections) do if connection then connection:Disconnect() end end
connections = {}
ScreenGui:Destroy()
print("God Hub v17 выгружен.")
end)
local Footer = Instance.new("TextLabel")
Footer.Size = UDim2.new(1, 0, 0, 20); Footer.Position = UDim2.new(0, 0, 1, -20); Footer.BackgroundTransparency = 1; Footer.Text = "[Правый Shift] — Скрыть / Открыть меню"
Footer.TextColor3 = Color3.fromRGB(110, 110, 120); Footer.Font = Enum.Font.Gotham; Footer.TextSize = 9; Footer.Parent = MainFrame
print("Ragdoll MMA Eagle Hub v17 успешно загружен!")